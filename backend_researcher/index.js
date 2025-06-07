import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import bcrypt from "bcrypt";
import OpenAI from "openai";
import dotenv from "dotenv";
import { DateTime } from "luxon";

dotenv.config();

const app = express();
const port = 8080;

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
// Temporary here for dev import in after from supabase.js module
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

//Gmail OAuth, Getting User Data
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
];

function makeBody(to, from, subject, message) {
  const str = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    message,
  ].join("\n");

  const encodedMail = Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return encodedMail;
}

app.get("/auth/gmail-data/:userId", (req, res) => {
  const userId = req.params.userId;
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: userId,
  });
  res.redirect(authUrl);
});

app.get("/auth/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const { error: insertionError } = await supabase
      .from("User_Profiles")
      .update({
        gmail_auth_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
      })
      .eq("user_id", userId)
      .select()
      .single();
    if (insertionError) {
      return res.status(500).json({ message: "Insertion Error" });
    }
    res.redirect("http://localhost:3000/inbox/email");
  } catch (error) {
    console.error("Error getting tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

app.post("/gmail/create-draft/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  const { to, from, subject, message } = req.body;

  if (!to || !from || !subject || !message) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const { data: tokenData, error: fetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (fetchError || !tokenData) {
    return res.status(401).json({ error: "Token Fetch Error" });
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const raw = makeBody(to, from, subject, message);
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });

    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draft.data.id,
      },
    ]);

    if (insertionError) {
      console.error(insertionError);
      return res.status(400).json({ message: "Unable to insert draft ID" });
    }

    return res.status(200).json({
      message: "Draft created and stored successfully",
      draftId: draft.data.id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/gmail/resume-draft/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;

  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .single();

  if (draftFetchError || !draftData) {
    return res.status(200).json({ message: "Draft not found. We need to create a new one." });
  }

  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token", "gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (tokenFetchError || !tokenData) {
    return res.status(404).json({ error: "Token not found" });
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token
  });

  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
      format: "full"
    });

    const payload = draft.data.message.payload;
    const headers = payload.headers;

    const subject = headers.find(h => h.name === "Subject")?.value || "";
    const part = payload.parts?.find(p => p.mimeType === "text/plain");
    const messageBase64 = part?.body?.data || payload.body?.data || "";
    const message = Buffer.from(messageBase64, "base64").toString("utf8");

    return res.status(200).json({ subject, message });

  } catch (error) {

    if (error.response.data.error.code === 401) {
      return res.status(200).json({ message: "Gmail draft not found. Compose a new one!" });
    }

    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/gmail/update-draft/:userId/:professorId", async (req, res) => {
  const {userId, professorId} = req.params
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .single()
  
  if (!draftData || draftFetchError) {
    return res.status(401).json({message: "No Draft Found"})
  }
  
  const { data: tokenData, error: tokenFetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, refresh_auth_token")
      .eq("user_id", userId)
      .single()
  
  if (!tokenData || tokenFetchError) {
    return res.status(401).json({message: "Token not found"})
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.refresh_auth_token
  })
  try {
    await oauth2Client.getAccessToken()
    const gmail = google.gmail({version: "v1", auth: oauth2Client})
    const updateGmail = await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      
    })
    
      
  } catch {
    return res.status(500).json({message: "Internal Server Error"})
  }
})

app.post(
  "/gmail/gcalendar/send-draft-follow/:userId/:draftId",
  async (req, res) => {
    const draftId = req.params.draftId;
    const userId = req.params.userId;
    const { data: tokenData, error: fetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (fetchError || !tokenData) {
      return res.status(401).json({ error: "Fetch Error" });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });
    try {
      await oauth2Client.getAccessToken();
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const startTime = DateTime.now()
        .setZone(timeZone)
        .plus({ days: 7 })
        .set({ hour: 12, minute: 0, second: 0 })
        .toISO();
      const endTime = DateTime.fromISO(startTime).plus({ hours: 1 }).toISO();

      const event = {
        summary: eventName,
        description: description,
        start: {
          dateTime: startTime,
          timeZone: timeZone,
        },
        end: {
          dateTime: endTime,
          timeZone: timeZone,
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 10 },
            { method: "email", minutes: 15 },
          ],
        },
      };

      const invitiationResponse = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });

      const sendResponse = await gmail.users.drafts.send({
        userId: "me",
        requestBody: {
          id: draftId,
        },
      });
      const { error: insertionError } = await supabase
        .from("Emails")
        .insert([{ email_id: sendResponse.data.id, sent_at: Date.now() }])
        .select();

      if (insertionError) {
        return res.status(400).json({ message: "Insertion Error" });
      }

      return res.status(200).json({ message: "Inserted Successfully" });
    } catch {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

app.get("/gmail/emails/:userId", async (req, res) => {
  const { userId } = req.params;

  const { data: tokenData, error: fetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (fetchError || !tokenData) {
    return res.status(401).json({ error: "Fetch Error" });
  }

  //Initialise Client
  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
    });

    const messages = response.data.messages || [];

    const fullMessages = await Promise.all(
      messages.map(async (msg) => {
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const payload = fullMsg.data.payload;
        const headers = payload.headers || [];

        const subject = headers.find((h) => h.name === "Subject")?.value || "";

        const fromHeader = headers.find((h) => h.name === "From")?.value || "";
        const fromMatch = fromHeader.match(/^(.*?)(?:\s*<(.+?)>)?$/);
        const fromName = fromMatch?.[1]?.trim() || "";
        const fromEmail = fromMatch?.[2]?.trim() || "";

        const dateHeader = headers.find((h) => h.name === "Date")?.value || "";
        const receivedAt = new Date(dateHeader).toISOString();

        const bodyData = payload.parts?.find(
          (part) => part.mimeType === "text/plain"
        )?.body?.data;

        const body = bodyData
          ? Buffer.from(bodyData, "base64").toString("utf-8")
          : "";

        return {
          id: msg.id,
          subject,
          from: {
            name: fromName,
            email: fromEmail,
          },
          receivedAt,
          body,
        };
      })
    );

    return res.status(200).json({ emails: fullMessages });
  } catch (err) {
    console.error("Failed to fetch emails:", err);
    return res.status(500).json({ message: "Failed to Fetch Emails." });
  }
});

app.post("/gmail/send-later/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { data: tokenData, error: fetchError } = supabase
    .from("User_Profiles")
    .select("gmail_auth_token", "gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (fetchError || !tokenData) {
    return res.status(401).json({ error: "Fetch Error" });
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();
  } catch {}
});

//Temporary Endpoints Make Modular
app.post("/auth/register", async (req, res) => {
  const {
    student_email,
    student_password,
    student_major,
    student_firstname,
    student_lastname,
    student_year,
    student_interests,
    student_acceptedterms,
    student_motivation,
  } = req.body;

  try {
    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email: student_email,
      password: student_password,
    });

    const research_input_embeddings = student_interests.join();

    const embeddings = await OPEN_AI.embeddings.create({
      model: "text-embedding-3-large",
      input: research_input_embeddings,
    });

    if (authError) {
      return res.status(400).json({ message: authError.message });
    }

    const userId = signUpData.user.id;
    const { error: profileError } = await supabase
      .from("User_Profiles")
      .insert({
        user_id: userId,
        student_email: student_email,
        student_major: student_major,
        student_firstname: student_firstname,
        student_lastname: student_lastname,
        student_year: student_year,
        student_interests: student_interests,
        student_acceptedterms: student_acceptedterms,
        student_embeddings: embeddings.data[0].embedding,
        student_motivation: student_motivation,
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ message: profileError.message });
    }

    const { data: newBoard, error: insertError } = await supabase
      .from("Applications")
      .insert([
        {
          user_id: userId,
          in_complete: [],
          in_progress: [],
          completed: [],
          follow_up: [],
        },
      ])
      .single();

    if (insertError) {
      return res
        .status(400)
        .json({ message: "Could not create application board." });
    }

    return res.status(201).json({ message: "Sucessfully Registered" });
  } catch (err) {
    return res.status(500).json({ message: `Internal server error ${err}` });
  }
});

app.post("/match-professors", async (req, res) => {
  const { student_id, match_threshold = 0.2, match_count = 5 } = req.body;
  try {
    const { data, error } = await supabase.rpc("match_professors_for_student", {
      student_id,
      match_threshold,
      match_count,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ matches: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/auth/refresh-jwt", async (req, res) => {
  const { refreshToken } = req.body;
  try {
  } catch {}
});

app.post("/auth/verify-code", async (req, res) => {
  const { email, code } = req.body;
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({ session: data.session, user: data.user });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.session) {
      return res
        .status(400)
        .json({ message: authError?.message || "Login failed" });
    }

    return res.status(200).json({
      userId: authData.user.id,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });
  } catch (error) {
    return res.status(500).json({ message: "An error occurred" });
  }
});

//Get The Whole User
app.get("/auth/get-user", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No Bearer token provided" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return res
        .status(401)
        .json({ error: authError?.message || "Invalid user" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("User_Profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }
    return res.status(200).json({ profile });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

//Get Just ID and Email
app.get("/auth/get-user-id-email", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No Bearer token provided" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return res
        .status(401)
        .json({ error: authError?.message || "Invalid user" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("User_Profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json({
      user_id: profile.user_id,
      student_email: profile.student_email,
      student_motivation: profile.student_motivation,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

app.get("/auth/get-user-sidebar-info", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No Bearer token provided" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return res
        .status(401)
        .json({ error: authError?.message || "Invalid user" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("User_Profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json({
      user_id: profile.user_id,
      student_firstname: profile.student_firstname,
      student_lastname: profile.student_lastname,
      student_email: profile.student_email,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

app.get("/auth/get-professor-ids/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const { data: professorArrayData, error: professorArrayError } =
      await supabase
        .from("User_Profiles")
        .select("saved_professors")
        .eq("user_id", userId)
        .single();

    if (professorArrayError) {
      return res.status(400).json({
        message: "Failed to Fetch",
      });
    }

    return res.status(200).json(professorArrayData);
  } catch {
    return res.status(500).json({
      message: "Internal Server Error. Please Try Again Later",
    });
  }
});

app.get("/auth/get-applied-professor-ids/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const { data: professorArrayData, error: professorArrayError } =
      await supabase
        .from("User_Profiles")
        .select("applied_professors")
        .eq("user_id", userId)
        .single();

    if (professorArrayError) {
      return res.status(400).json({
        message: "Failed to Fetch",
      });
    }

    return res.status(200).json(professorArrayData);
  } catch {
    return res.status(500).json({
      message: "Internal Server Error. Please Try Again Later",
    });
  }
});

app.get("/taishan", async (req, res) => {
  const { data, error } = await supabase.from("Taishan").select("*").limit(10);
  //try catch this
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ data });
});

app.get("/kanban/get/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const { data: board, error } = await supabase
      .from("Applications")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.log("❌ Error fetching board:", error.message);
      return res
        .status(400)
        .json({ message: "Unable to fetch application board." });
    }

    if (!board) {
      console.log("⚠️ No board found for user:", userId);
      return res.status(404).json({ message: "Application board not found." });
    }

    return res.status(200).json({ data: board });
  } catch (error) {
    console.log("🔥 Unexpected error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

//KANBAN STARTS HERE

//In Progress KANBAN Starts Here

// Keep this, merge it with the apply button and make it so when someone clicks it
// The data is added to is complete or if it is already saved, it moves it from saved to is complete
// and if it is completed then render back you have already applied here, do you want to follow up perhaps
// and move to follow up and then create email again with follow up and create separate llm agent for that
app.post("/kanban/add-in-progress/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { professor_data: newProfessorData } = req.body;

  // Validate incoming data
  if (!newProfessorData || !newProfessorData.id) {
    return res
      .status(400)
      .json({ message: "Professor data and ID are required." });
  }

  // Declare professorIdToMove here, before its first use
  const professorIdToMove = newProfessorData.id;

  try {
    // Fetch current application data for the user
    const { data: tableData, error: fetchError } = await supabase
      .from("Applications")
      .select("in_complete, in_progress, completed, follow_up")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError);
      return res
        .status(500)
        .json({ message: "Failed to retrieve user application data." });
    }

    // Fetch applied professors from User_Profiles
    const { data: appliedData, error: appliedError } = await supabase
      .from("User_Profiles")
      .select("applied_professors")
      .eq("user_id", userId)
      .single();

    if (appliedError) {
      console.error("Supabase fetch error:", appliedError);
      return res
        .status(500)
        .json({ message: "Failed to retrieve user profile data." });
    }

    // Update applied_professors list in User_Profiles
    let currentAppliedProfessors = appliedData.applied_professors || [];
    // Ensure no duplicates before adding to applied_professors
    if (!currentAppliedProfessors.includes(professorIdToMove)) {
      currentAppliedProfessors.push(professorIdToMove);
    }

    const { error: userProfileUpdateError } = await supabase
      .from("User_Profiles")
      .update({
        applied_professors: currentAppliedProfessors,
      })
      .eq("user_id", userId);

    if (userProfileUpdateError) {
      console.error("Supabase update error:", userProfileUpdateError);
      return res.status(500).json({
        message: "Failed to update user profile's applied professors.",
        error: userProfileUpdateError.message,
      });
    }

    // Initialize kanban columns from fetched data
    let inComplete = tableData.in_complete || [];
    let inProgress = tableData.in_progress || [];
    let completed = tableData.completed || [];
    let followUp = tableData.follow_up || [];

    // Check if the professor is already in the 'In Progress' column
    const isAlreadyInProgress = inProgress.some(
      (prof) => prof.id === professorIdToMove
    );

    if (isAlreadyInProgress) {
      return res.status(409).json({
        message: "This professor is already in the 'In Progress' column.",
      });
    }

    // Remove the professor from other columns if present
    inComplete = inComplete.filter((prof) => prof.id !== professorIdToMove);
    completed = completed.filter((prof) => prof.id !== professorIdToMove);
    followUp = followUp.filter((prof) => prof.id !== professorIdToMove);

    // Add the new professor data to 'In Progress' with a timestamp
    const professorWithTimestamp = {
      ...newProfessorData,
      added_at: new Date().toISOString(),
    };
    inProgress = [...inProgress, professorWithTimestamp];

    // Update the Applications table with the modified columns
    const { error: updateError } = await supabase
      .from("Applications")
      .update({
        in_complete: inComplete,
        in_progress: inProgress,
        completed: completed,
        follow_up: followUp,
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return res.status(500).json({
        message: "Failed to update application columns.",
        error: updateError.message,
      });
    }

    return res.status(200).json({
      message: "Professor successfully moved to 'In Progress' column.",
    });
  } catch (error) {
    console.error("Server error in /kanban/add-in-progress:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

app.delete(
  "/kanban/delete-in-progress/:userId/:professorId",
  async (req, res) => {
    const userId = req.params.userId;
    const professorId = parseInt(req.params.professorId);

    try {
      const { data: currentApp, error: fetchError } = await supabase
        .from("Applications")
        .select("in_progress")
        .eq("user_id", userId)
        .single();

      if (fetchError) {
        return res.status(400).json({ message: fetchError.message });
      }

      const currentInProgress = currentApp.in_progress || [];

      const updatedInProgress = currentInProgress.filter(
        (prof) => prof.id !== professorId
      );

      if (updatedInProgress.length === currentInProgress.length) {
        return res
          .status(404)
          .json({ message: "Professor not found in In Progress" });
      }

      const { data, error: updateError } = await supabase
        .from("Applications")
        .update({ in_progress: updatedInProgress })
        .eq("user_id", userId);

      if (updateError) {
        return res.status(500).json({ message: "Internal Error" });
      }

      return res.status(200).json({ data: data });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

app.delete(
  "/kanban/delete-in-complete/:userId/:professorId",
  async (req, res) => {
    const userId = req.params.userId;
    const professorId = parseInt(req.params.professorId);

    try {
      const { data: currentApp, error: fetchError } = await supabase
        .from("Applications")
        .select("in_complete")
        .eq("user_id", userId)
        .single();

      if (fetchError) {
        return res.status(400).json({ message: fetchError.message });
      }

      const currentInComplete = currentApp.in_complete || [];

      const updatedInComplete = currentInComplete.filter(
        (prof) => prof.id !== professorId
      );

      if (updatedInComplete.length === currentInComplete.length) {
        return res
          .status(404)
          .json({ message: "Professor not found in In Progress" });
      }

      const { data, error: updateError } = await supabase
        .from("Applications")
        .update({ in_complete: updatedInComplete })
        .eq("user_id", userId);

      if (updateError) {
        return res.status(500).json({ message: "Internal Error" });
      }

      return res.status(200).json({ data: data });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

app.put(
  "/kanban/update-in-progress-to-completed/:userId/:professorId",
  async (req, res) => {
    const userId = req.params.userId;
    const professorId = parseInt(req.params.professorId);
    try {
      const { data: currentApp, error: authError } = await supabase
        .from("Applications")
        .select("in_progress, completed")
        .eq("user_id", userId)
        .single();

      if (authError) {
        return res.status(400).json({ message: "Authentication Error" });
      }
      if (!currentApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      const currentInProgress = currentApp.in_progress || [];
      const currentCompleted = currentApp.completed || [];

      const professorToMove = currentInProgress.find(
        (prof) => prof.id === professorId
      );
      if (!professorToMove) {
        return res
          .status(404)
          .json({ message: "Professor not found in In Progress" });
      }

      const updatedInProgress = currentInProgress.filter(
        (prof) => prof.id !== professorId
      );
      const updatedCompleted = [...currentCompleted, professorToMove];
      const { data, error: updateError } = await supabase
        .from("Applications")
        .update({
          in_progress: updatedInProgress,
          completed: updatedCompleted,
        })
        .eq("user_id", userId);

      if (updateError) {
        res.status(500).json({
          message: "Internal Server Error",
        });
      }
      return res.status(200).json({
        message: "Professor moved to completed",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

// Add In Complete / Saved Section Implementations All Here
app.post("/kanban/add-in-complete/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { professor_data } = req.body;

  console.log(
    `[DEBUG] Incoming request to add in-complete for userId: ${userId}`
  );
  console.log(`[DEBUG] Received professor_data:`, professor_data);

  if (!professor_data || !professor_data.id) {
    console.log(`[ERROR] Missing professor data or ID`);
    return res
      .status(400)
      .json({ message: "Professor data with ID is required." });
  }

  const professorId = professor_data.id;

  try {
    const { data: appData, error: appFetchError } = await supabase
      .from("Applications")
      .select("in_complete")
      .eq("user_id", userId)
      .single();

    if (appFetchError) {
      console.log(`[ERROR] Failed to fetch Applications:`, appFetchError);
      return res
        .status(400)
        .json({ message: "Could not fetch application data." });
    }

    const currentInComplete = appData?.in_complete || [];
    console.log(`[DEBUG] Current in_complete list:`, currentInComplete);

    const alreadyInIncomplete = currentInComplete.some(
      (prof) => prof.id === professorId
    );
    let updatedInComplete = currentInComplete;

    if (!alreadyInIncomplete) {
      const professorWithTimestamp = {
        ...professor_data,
        added_at: new Date().toISOString(),
      };
      updatedInComplete = [...currentInComplete, professorWithTimestamp];
      console.log(`[DEBUG] Updated in_complete to save:`, updatedInComplete);

      const { error: appUpdateError } = await supabase
        .from("Applications")
        .update({ in_complete: updatedInComplete })
        .eq("user_id", userId);

      if (appUpdateError) {
        console.log(`[ERROR] Failed to update Applications:`, appUpdateError);
        return res
          .status(400)
          .json({ message: "Could not update application data." });
      }
    } else {
      console.log(
        `[INFO] Professor already in in_complete list, skipping update`
      );
    }

    const { data: profileData, error: profileFetchError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (profileFetchError) {
      console.log(`[ERROR] Failed to fetch User_Profiles:`, profileFetchError);
      return res.status(400).json({ message: "Could not fetch profile data." });
    }

    const currentSaved = profileData?.saved_professors || [];
    console.log(`[DEBUG] Current saved_professors list:`, currentSaved);

    const alreadySaved = currentSaved.includes(professorId);

    if (!alreadySaved) {
      const updatedSaved = [...currentSaved, professorId];
      console.log(`[DEBUG] Updating saved_professors to:`, updatedSaved);

      const { error: savedUpdateError } = await supabase
        .from("User_Profiles")
        .update({ saved_professors: updatedSaved })
        .eq("user_id", userId);

      if (savedUpdateError) {
        console.log(
          `[ERROR] Failed to update User_Profiles:`,
          savedUpdateError
        );
        return res
          .status(400)
          .json({ message: "Could not update saved professors." });
      }
    } else {
      console.log(`[INFO] Professor already saved in User_Profiles`);
    }

    console.log(`[SUCCESS] Professor saved successfully for user ${userId}`);
    return res.status(200).json({ message: "Professor saved successfully." });
  } catch (err) {
    console.log(`[UNEXPECTED ERROR]:`, err);
    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

app.delete("/kanban/remove-in-complete/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { professor_id } = req.body;

  if (!professor_id) {
    return res.status(400).json({ message: "Professor ID is required." });
  }

  try {
    const { data: appData, error: appFetchError } = await supabase
      .from("Applications")
      .select("in_complete")
      .eq("user_id", userId)
      .single();

    if (appFetchError) {
      return res
        .status(400)
        .json({ message: "Could not fetch application data." });
    }

    const currentInComplete = appData?.in_complete || [];
    const updatedInComplete = currentInComplete.filter(
      (prof) => prof.id !== professor_id
    );

    if (updatedInComplete.length !== currentInComplete.length) {
      const { error: appUpdateError } = await supabase
        .from("Applications")
        .update({ in_complete: updatedInComplete })
        .eq("user_id", userId);

      if (appUpdateError) {
        return res
          .status(400)
          .json({ message: "Could not update application data." });
      }
    }

    // --- Step 2: Remove from User_Profiles.saved_professors ---
    const { data: profileData, error: profileFetchError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (profileFetchError) {
      return res.status(400).json({ message: "Could not fetch profile data." });
    }

    const currentSaved = profileData?.saved_professors || [];
    const updatedSaved = currentSaved.filter((id) => id !== professor_id);

    if (updatedSaved.length !== currentSaved.length) {
      const { error: profileUpdateError } = await supabase
        .from("User_Profiles")
        .update({ saved_professors: updatedSaved })
        .eq("user_id", userId);

      if (profileUpdateError) {
        return res
          .status(400)
          .json({ message: "Could not update saved professors." });
      }
    }

    return res.status(200).json({ message: "Professor removed successfully." });
  } catch (err) {
    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

/*
app.put(
  "/kanban/update-incomplete-to-inprogress/:userId/:professorId",
  async (req, res) => {
    const userId = req.params.userId;
    const professorId = parseInt(req.params.professorId);
    try {
      const { data: currentApp, error: authError } = await supabase
        .from("Applications")
        .select("in_complete, in_progress")
        .eq("user_id", userId)
        .single();

      if (authError) {
        return res.status(400).json({ message: "Authentication Error" });
      }
      if (!currentApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      const currentInProgress = currentApp.in_progress || [];
      const currentInComplete = currentApp.in_complete || [];

      const professorToMove = currentInComplete.find(
        (prof) => prof.id === professorId
      );
      if (!professorToMove) {
        return res
          .status(404)
          .json({ message: "Professor not found in In Complete" });
      }

      const updatedInComplete = currentInComplete.filter(
        (prof) => prof.id !== professorId
      );
      const updatedInProgress = [...currentInProgress, professorToMove];
      const { data, error: updateError } = await supabase
        .from("Applications")
        .update({
          in_complete: updatedInComplete,
          in_progress: updatedInProgress,
        })
        .eq("user_id", userId);

      if (updateError) {
        res.status(500).json({
          message: "Internal Server Error",
        });
      }
      return res.status(200).json({
        message: "Professor moved to In Progress",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);
*/

//Run as a cron job, for moving things to follow up and sending email to remind them to follow up after
app.post("/kanban/maintenance/:id", async (req, res) => {
  const userId = req.params.id;
  const { force } = req.query;

  try {
    const { data: application, error: fetchError } = await supabase
      .from("Applications")
      .select("completed")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      return res.status(400).json({ message: fetchError.message });
    }

    const currentInProgress = application.in_progress || [];
    const currentFollowUp = application.follow_up || [];
    const lastMaintenance =
      application.last_maintenance || new Date(0).toISOString();
    const shouldRun =
      force || new Date() - new Date(lastMaintenance) > 24 * 60 * 60 * 1000;

    if (!shouldRun) {
      return res.status(200).json({
        message: "Maintenance not needed",
        data: application,
      });
    }
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [updatedInProgress, movedToFollowUp] = currentInProgress.reduce(
      ([inProgress, followUp], prof) => {
        const addedDate = new Date(prof.added_at);
        if (addedDate < oneWeekAgo) {
          followUp.push(prof);
        } else {
          inProgress.push(prof);
        }
        return [inProgress, followUp];
      },
      [[], [...currentFollowUp]]
    );

    const { data, error: updateError } = await supabase
      .from("Applications")
      .update({
        in_progress: updatedInProgress,
        follow_up: movedToFollowUp,
        last_maintenance: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    return res.status(200).json({
      message: "Maintenance completed",
      data: {
        in_progress: updatedInProgress,
        follow_up: movedToFollowUp,
        moved_count: movedToFollowUp.length - currentFollowUp.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
