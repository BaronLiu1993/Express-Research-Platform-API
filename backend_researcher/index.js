import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import EmailReplyParser from "email-reply-parser";
import { simpleParser } from "mailparser";
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

//Helper Funcitons

function makeBody(to, fromName, fromEmail, subject, htmlMessage) {
  const mimeMessage = [
    `To: ${to}`,
    `From: ${fromName} <${fromEmail}>`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    ``,
    `${htmlMessage}`,
  ].join("\n");

  //Encode
  return Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBody(encoded) {
  let padded = encoded;
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  padded = padded.replace(/-/g, "+").replace(/_/g, "/");
  const buffer = Buffer.from(padded, "base64");
  return buffer.toString("utf-8");
}

function extractHtmlOrPlainText(payload) {
  if (!payload) return null;

  if (
    (payload.mimeType === "text/html" || payload.mimeType === "text/plain") &&
    payload.body?.data
  ) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const result = getLatestReply(part);
      if (result) return result;
    }
  }

  return null;
}

app.get("/auth/github/:userId", (req, res) => {
  const { userId } = req.params;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectURI = "http://localhost:8080/oauth/callback/github";
  const scope = "repo";
  return res.status(200).json({
    link: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectURI}&scope=${scope}&state=${userId}`,
  });
});

app.get("/oauth/callback/github/", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = await response.json();
  const accessToken = data.access_token;
  const { error: insertionError } = await supabase
    .from("User_Profiles")
    .update({ github_token: accessToken })
    .eq("user_id", state);

  if (insertionError) {
    return res.status(400).json({ message: "Failed To Insert" });
  }

  res.redirect(`http://localhost:3000/notion/build`);
});

app.post("/github/build-portfolio/:userId", async (req, res) => {
  const { userId } = req.params;
  const { resume } = req.body;

  // Create simple HTML string (expand as needed)
  const htmlContent = `
  <html>
    <head><title>${resume.name} Portfolio</title></head>
    <body>
      <h1>${resume.name}'s Portfolio</h1>
      <p>Email: ${resume.contact_information.email}</p>
    </body>
  </html>
  `;

  try {
    // Fetch GitHub token and user info from Supabase
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from("User_Profiles")
      .select("github_token, student_firstname, student_lastname")
      .eq("user_id", userId)
      .single();

    if (tokenFetchError) {
      console.error("Error fetching token from Supabase:", tokenFetchError);
      return res.status(400).json({ message: "Failed To Fetch Token" });
    }

    const uuid = uuidv4();
    const repoName = `portfolio-${uuid}`;

    // Create GitHub repo
    const repoRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `token ${tokenData.github_token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        name: repoName,
        description: "Auto-Generated Portfolio Website",
        private: false,
        auto_init: true,
      }),
    });

    if (!repoRes.ok) {
      const err = await repoRes.json();
      return res
        .status(400)
        .json({ message: "GitHub Repo Creation Failed", error: err });
    }

    const repo = await repoRes.json();

    const username = repo.owner.login;

    const encodedContent = Buffer.from(htmlContent).toString("base64");

    const commitRes = await fetch(
      `https://api.github.com/repos/${username}/${repoName}/contents/index.html`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${tokenData.github_token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          message: "Add portfolio index.html",
          content: encodedContent,
        }),
      }
    );

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return res
        .status(400)
        .json({ message: "Failed to commit index.html", error: err });
    }

    const pagesRes = await fetch(
      `https://api.github.com/repos/${username}/${repoName}/pages`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${tokenData.github_token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          source: { branch: "main", path: "/" },
        }),
      }
    );

    const siteUrl = `https://${username}.github.io/${repoName}`;

    const { error: insertionError } = await supabase
      .from("User_Profiles")
      .update({ github_pages_url: siteUrl })
      .eq("user_id", userId);

    if (insertionError) {
      return res.status(400).json({ message: "Failed To Fetch Token" });
    }

    res.status(200).json({ message: "Portfolio Created", url: siteUrl });
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error });
  }
});

//Tracking and Analytics
//Change URL later so that it is less suspicious
app.get("/track/:userId/:trackingId", async (req, res) => {
  const { userId, trackingId } = req.params;

  const { data: githubData, error: githubError } = await supabase
    .from("User_Profiles")
    .select("github_pages_url")
    .eq("user_id", userId)
    .single();

  if (githubError) {
    return res.status(404).send("Portfolio not found");
  }
  console.log(trackingId);
  const { error: trackingError } = await supabase
    .from("Messages")
    .update({
      opened: true,
      opened_at: new Date(),
    })
    .eq("tracking_id", trackingId);

  const { error } = await supabase.rpc("increment_emails_engaged_by_user", {
    user_uuid: userId,
  });

  return res.redirect(githubData.github_pages_url);
});

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
    res.status(500).send("Authentication failed");
  }
});

app.post("/gmail/create-draft/:userId/:professorId", async (req, res) => {
  //Data Required
  const { userId, professorId } = req.params;
  const { to, fromName, fromEmail, subject, message } = req.body;

  if (!to || !fromName || !fromEmail || !subject || !message) {
    return res.status(400).json({});
  }

  //Get Auth Tokens
  const { data: tokenData, error: fetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  //Failed If unable to get Data
  if (fetchError || !tokenData) {
    return res.status(401).json({});
  }

  //Set credentials
  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();

    //Create the body
    const trackingId = uuidv4();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const raw = makeBody(to, fromName, fromEmail, subject, message);
    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });
    const { error: insertionError } = await supabase.from("Emails").insert([
      {
        user_id: userId,
        professor_id: parseInt(professorId),
        draft_id: draft.data.id,
        tracking_id: trackingId,
      },
    ]);

    if (insertionError) {
      return res.status(400).json({ message: "Insertion Error" });
    }

    return res.status(200).json({ draftId: draft.data.id });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/gmail/resume-draft/:userId/:professorId", async (req, res) => {
  //Params to get the draft data
  const { userId, professorId } = req.params;

  //Draft Data
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .single();

  if (draftFetchError || !draftData || !draftData.draft_id) {
    return res.status(200).json({
      draftExists: false,
    });
  }

  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (
    tokenFetchError ||
    !tokenData ||
    !tokenData.gmail_auth_token ||
    !tokenData.gmail_refresh_token
  ) {
    return res.status(404).json({});
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftData.draft_id,
    });

    console.log(decodeBody(draft.data.message.payload.body.data));

    //Parsing the payload and breaking it down
    const payload = draft.data.message.payload;
    const headers = payload.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const htmlBody = extractHtmlOrPlainText(payload);

    return res.status(200).json({
      draftExists: true,
      subject: subject,
      body: htmlBody,
    });
  } catch (error) {
    if (error.response?.data?.error?.code === 401) {
      return res.status(200).json({ draftExists: false });
    }

    return res.status(500).json({ draftExists: false });
  }
});

app.put("/gmail/update-draft/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  const { to, fromName, fromEmail, subject, body } = req.body;
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .single();
  if (!draftData || draftFetchError || !draftData.draft_id) {
    return res.status(401).json({ updated: false });
  }

  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (!tokenData || tokenFetchError) {
    return res.status(401).json({ updated: false });
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  const raw = makeBody(to, fromName, fromEmail, subject, body);
  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const draft = await gmail.users.drafts.update({
      userId: "me",
      id: draftData.draft_id,
      requestBody: { message: { raw } },
    });

    return res.status(200).json({ updated: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ updated: false });
  }
});



app.post(
  "/gmail/gcalendar/send-draft/:userId/:professorId",
  async (req, res) => {
    // Get userId, professorId, timeZone, eventName and description
    const { userId, professorId } = req.params;
    const { timeZone, eventName, description } = req.body;

    try {
      const { data: tokenData, error: tokenFetchError } = await supabase
        .from("User_Profiles")
        .select("gmail_auth_token, gmail_refresh_token")
        .eq("user_id", userId)
        .single();

      if (tokenFetchError || !tokenData) {
        return res.status(400).json({});
      }

      const { data: draftIdData, error: draftIdFetchError } = await supabase
        .from("Emails")
        .select("draft_id, tracking_id")
        .eq("user_id", userId)
        .eq("professor_id", professorId)
        .single();

      if (draftIdFetchError || !draftIdData || !draftIdData.draft_id) {
        return res.status(404).json({});
      }

      oauth2Client.setCredentials({
        access_token: tokenData.gmail_auth_token,
        refresh_token: tokenData.gmail_refresh_token,
      });

      await oauth2Client.getAccessToken();
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const sendResponse = await gmail.users.drafts.send({
        userId: "me",
        requestBody: {
          id: draftIdData.draft_id,
        },
      });

      const startTime = DateTime.now()
        .setZone(timeZone)
        .plus({ days: 7 })
        .set({ hour: 12, minute: 0, second: 0 })
        .toISO();
      const endTime = DateTime.fromISO(startTime).plus({ hours: 1 }).toISO();
      const event = {
        summary: eventName,
        description,
        start: { dateTime: startTime, timeZone },
        end: { dateTime: endTime, timeZone },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 10 },
            { method: "email", minutes: 15 },
          ],
        },
      };
      await calendar.events.insert({ calendarId: "primary", resource: event });

      const { data: inProgressData, error: inProgressFetchError } =
        await supabase
          .from("InProgress")
          .select("*")
          .eq("user_id", userId)
          .eq("professor_id", professorId)
          .single();

      console.log(inProgressFetchError);
      if (!inProgressFetchError) {
        const { error: insertionError } = await supabase
          .from("Completed")
          .insert(inProgressData);
        console.log(inProgressData);
        console.log(insertionError);

        const { error: deletionError } = await supabase
          .from("InProgress")
          .delete()
          .eq("user_id", userId)
          .eq("professor_id", professorId);
        console.log(deletionError);
      }

      await supabase
        .from("Emails")
        .update({
          thread_id: sendResponse.data.threadId,
          sent_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("professor_id", professorId);
      await supabase.from("Messages").insert({
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        tracking_id: draftIdData.tracking_id,
      });

      const { error: insertionError } = await supabase
        .from("Key_Performance_Indicators")
        .update({})
        .eq("user_id", userId)
        .increment({ emails_sent: 1 });

      return res.status(200).json({});
    } catch (err) {
      return res.status(500).json({});
    }
  }
);

app.post("/gmail/create-follow-up-draft/", async (req, res) => {

}) 

app.post("/gmail/save-follow-up/", async => {
  
})

app.post(
  "/gmail/gcalendar/follow-up-reply/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    const { body, subject } = req.body;

    const { data: thread, error }
  }
);

app.get("/gmail/get-engagement/:threadId/:messageId", async (req, res) => {
  const { threadId, messageId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await supabase
      .from("Messages")
      .select("opened, opened_at")
      .eq("thread_id", threadId)
      .eq("message_id", messageId)
      .single();

    if (messageDataError) {
      return res.status(400).json({ opened: false, opened_at: "Not Opened" });
    }

    return res
      .status(200)
      .json({ opened: messageData.opened, opened_at: messageData.opened_at });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/gmail/get-status/:threadId/", async (req, res) => {
  const { threadId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await supabase
      .from("Emails")
      .select("status")
      .eq("thread_id", threadId)
      .single();

    if (messageDataError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }
    const data = messageData.status;
    return res.status(200).json({ data });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/gmail/update-status/:threadId/", async (req, res) => {
  const { threadId } = req.params;
  const { value } = req.body;
  try {
    const { error: messageDataError } = await supabase
      .from("Emails")
      .update({ status: value })
      .eq("thread_id", threadId)
      .single();

    if (messageDataError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }
    return res.status(200).json({ message: "Successfully Inserted" });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
//get first and second only
app.get("/gmail/get-email-chain/:userId", async (req, res) => {
  const { userId } = req.params;

  const { data: completedData, error: completedFetchError } = await supabase
    .from("Completed")
    .select("professor_id")
    .eq("user_id", userId);

  if (completedFetchError || !completedData?.length) {
    return res
      .status(401)
      .json({ error: "Error fetching completed professors" });
  }

  const completedProfessorIds = completedData.map((row) => row.professor_id);
  console.log(completedProfessorIds);
  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (tokenFetchError || !tokenData) {
    return res.status(401).json({ error: "Token fetch error" });
  }

  const { data: threadData, error: threadFetchError } = await supabase
    .from("Emails")
    .select("thread_id")
    .eq("user_id", userId)
    .in("professor_id", completedProfessorIds);

  if (threadFetchError || !threadData?.length) {
    return res.status(401).json({ error: "Thread fetch error" });
  }
  const allThreadIds = threadData.map((row) => row.thread_id);

  const { data: professorData, error: professorFetchError } = await supabase
    .from("Taishan")
    .select("name")
    .in("id", completedProfessorIds);

  if (professorFetchError || !professorData) {
    return res.status(401).json({ error: "Professor Data fetch error" });
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const threadArray = [];
    for (let i = 0; i < allThreadIds.length; i++) {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: allThreadIds[i],
      });
      const headers = thread.data.messages[0].payload.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      const body = decodeBody(thread.data.messages[0].payload.body.data);
      const threadObject = {
        threadId: allThreadIds[i],
        messageId: thread.data.messages[0].id,
        thread_title: `${professorData[i].name}`,
        firstMessageData: {
          subject: `${subject.slice(0, 40)}...`,
          date: date,
          body: `${body.slice(0, 40)}...`,
        },
      };
      threadArray.push(threadObject);
    }

    return res.status(200).json({ threadArray });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch Gmail thread." });
  }
});

app.get("/gmail/get-full-email-chain/:userId/:threadId", async (req, res) => {
  const { userId, threadId } = req.params;
  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();

  if (tokenFetchError || !tokenData) {
    return res.status(401).json({ error: "Token fetch error" });
  }
  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });
  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messageArray = [];
    const messages = threadData?.data?.messages || [];
    const messagesLength = messages.length;

    for (let i = 0; i < messagesLength; i++) {
      const message = threadData.data.messages[i];
      const labels = messages[i].labelIds || [];
      console.log(labels);
      const messageData = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "raw",
      });

      const response = await simpleParser(decodeBody(messageData.data.raw));
      const email = new EmailReplyParser().read(response.text);
      const body = email.getVisibleText();
      const toObj = response.to.value;
      const to = toObj[0];
      const fromObj = response.from.value;
      const from = fromObj[0];
      const subject = response.subject;
      const date = response.date;

      const messageObj = {
        labels,
        to,
        from,
        subject,
        body,
        date,
      };

      messageArray.push(messageObj);
    }

    return res.status(200).json({ messageArray });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
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

    const { error: dataError } = await supabase
      .from("Key_Performance_Indicators")
      .insert({
        user_id: userId,
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ message: profileError.message });
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
app.get("/kanban/get-followup/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: completedData, error: completedFetchError } = await supabase
      .from("Completed")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (completedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

app.post("/kanban/add-followup/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  const {
    name,
    email,
    url,
    lab_url,
    research_interests,
    labs,
    department,
    faculty,
    school,
    comments,
  } = req.body;

  if (!userId || !professorId) {
    return res.status(400).json({ message: "Frontend Error" });
  }

  try {
    // Insert into completed

    // delete from in progress
    const { error: inProgressDeletionError } = await supabase
      .from("InProgress")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId);

    if (inProgressDeletionError) {
      return res.status(400).json({ message: "Failed to delete" });
    }

    return res
      .status(200)
      .json({ message: "Professor successfully added to 'Completed' column." });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/kanban/delete-followup/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  try {
    const { error: deletionError } = await supabase
      .from("Completed")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId);

    if (deletionError) {
      return res.status(400).json({ message: "Failed to delete" });
    }
    return res.status(200).json({ message: "Delete Successful" });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Completed Section of Kanban
app.get("/kanban/get-completed/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: completedData, error: completedFetchError } = await supabase
      .from("Completed")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (completedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

app.get("/kanban/get-completed-professor-ids/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: completedData, error: completedFetchError } = await supabase
      .from("Completed")
      .select("professor_id")
      .eq("user_id", userId)
      .limit(10);
    if (completedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

app.post("/kanban/add-completed/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;

  if (!userId || !professorId) {
    return res.status(400).json({ message: "Frontend Error" });
  }

  try {
    // Insert into completed
    const { data: inProgressData, error: inProgressFetchError } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .single();

    if (inProgressFetchError) {
      return res.status(400).json({ message: "fetch error" });
    }
    const { error: completedInsertionError } = await supabase
      .from("Completed")
      .insert({
        user_id: inProgressData.user_id,
        professor_id: inProgressData.professor_id,
        name: inProgressData.name,
        email: inProgressData.email,
        url: inProgressData.url,
        lab_url: inProgressData.lab_url,
        labs: inProgressData.labs,
        department: inProgressData.department,
        faculty: inProgressData.faculty,
        school: inProgressData.school,
        research_interests: inProgressData.research_interests,
        comments: inProgressData.comments,
      })
      .single();

    if (completedInsertionError) {
      return res
        .status(400)
        .json({ message: "Failed to update application columns." });
    }

    // delete from in progress
    const { error: inProgressDeletionError } = await supabase
      .from("InProgress")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId);

    if (inProgressDeletionError) {
      return res.status(400).json({ message: "Failed to delete" });
    }

    return res
      .status(200)
      .json({ message: "Professor successfully added to 'Completed' column." });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete(
  "/kanban/delete-completed/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    try {
      const { error: deletionError } = await supabase
        .from("Completed")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (deletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      return res.status(200).json({ message: "Delete Successful" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

//In Progress KANBAN Starts Here
app.get("/kanban/get-in-progress/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: savedData, error: savedFetchError } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (savedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: savedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

app.post("/kanban/add-in-progress/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  const {
    name,
    email,
    url,
    lab_url,
    research_interests,
    labs,
    department,
    faculty,
    school,
  } = req.body;

  if (!userId || !professorId) {
    return res.status(400).json({ message: "Frontend Error" });
  }

  try {
    const { data: savedData, error: fetchSavedError } = await supabase
      .from("Saved")
      .select("comments, professorId")
      .eq("professor_id", professorId)
      .eq("user_id", userId);

    let comments = "";

    // Remove from Saved if it exists
    if (savedData?.length > 0) {
      const { error: savedDataDeletionError } = await supabase
        .from("Saved")
        .delete()
        .eq("professor_id", professorId)
        .eq("user_id", userId);

      comments = savedData.comments;
      if (savedDataDeletionError) {
        return res
          .status(400)
          .json({ message: "Error In Deleting Duplicate Row" });
      }
    }

    // Insert into InProgress
    const { error: inProgressInsertionError } = await supabase
      .from("InProgress")
      .insert({
        user_id: userId,
        professor_id: professorId,
        name,
        email,
        url,
        lab_url,
        labs,
        department,
        faculty,
        school,
        research_interests,
        comments,
      })
      .single();

    if (inProgressInsertionError) {
      return res
        .status(400)
        .json({ message: "Failed to update application columns." });
    }

    // Fetch user profile
    const { data: profileData, error: profileFetchError } = await supabase
      .from("User_Profiles")
      .select("applied_professors, saved_professors")
      .eq("user_id", userId)
      .single();

    if (profileFetchError) {
      return res.status(400).json({ message: "Could not fetch profile data." });
    }

    const currentSaved = profileData.saved_professors ?? [];
    const currentApplied = profileData.applied_professors ?? [];

    const alreadySaved = currentSaved.includes(professorId);
    const newApplied = [...currentApplied, professorId];

    if (alreadySaved) {
      const newSaved = currentSaved.filter(
        (prof) => String(prof) !== String(professorId)
      );
      const { error: profileIRError } = await supabase
        .from("User_Profiles")
        .update({
          saved_professors: newSaved,
          applied_professors: newApplied,
        })
        .eq("user_id", userId);

      if (profileIRError) {
        return res.status(400).json({ message: "Insertion and Removal Error" });
      }
    } else {
      const { error: profileInsertionError } = await supabase
        .from("User_Profiles")
        .update({
          applied_professors: newApplied,
        })
        .eq("user_id", userId);

      if (profileInsertionError) {
        return res
          .status(400)
          .json({ message: "Insertion Error for Second Function" });
      }
    }
    return res.status(200).json({
      message: "Professor successfully added to 'In Progress' column.",
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete(
  "/kanban/delete-in-progress/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    try {
      const { error: deletionError } = await supabase
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (deletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      const { data: profileData, error: profileFetchError } = await supabase
        .from("User_Profiles")
        .select("applied_professors")
        .eq("user_id", userId)
        .single();

      if (profileFetchError) {
        return res
          .status(400)
          .json({ message: "Could not fetch profile data." });
      }

      const currentApplied = profileData.applied_professors;
      const newApplied = currentApplied.filter(
        (prof) => String(prof) !== professorId
      );

      const { error: profileIRError } = await supabase
        .from("User_Profiles")
        .update({
          applied_professors: newApplied,
        })
        .eq("user_id", userId);

      return res.status(200).json({ message: "Delete Successful" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

// Saved Section Implementations All Here
// Save sends notifications that is the difference between that and inprogress
app.get("/kanban/get-saved/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: savedData, error: savedFetchError } = await supabase
      .from("Saved")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (savedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: savedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

app.post("/kanban/add-saved/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  const {
    name,
    email,
    url,
    lab_url,
    research_interests,
    labs,
    department,
    faculty,
    school,
    comments,
  } = req.body;

  try {
    const { error: savedInsertionError } = await supabase
      .from("Saved")
      .insert({
        user_id: userId,
        professor_id: professorId,
        name: name,
        email: email,
        url: url,
        lab_url: lab_url,
        labs: labs,
        department: department,
        faculty: faculty,
        school: school,
        research_interests: research_interests,
        comments: comments,
      })
      .single();
    if (savedInsertionError) {
      return res
        .status(400)
        .json({ message: "Could not fetch application data." });
    }

    const { data: profileData, error: profileFetchError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (profileFetchError) {
      return res.status(400).json({ message: "Could not fetch profile data." });
    }

    const currentSaved = profileData?.saved_professors || [];
    const alreadySaved = currentSaved.includes(professorId);

    if (!alreadySaved) {
      const updatedSaved = [...currentSaved, professorId];
      const { error: savedUpdateError } = await supabase
        .from("User_Profiles")
        .update({ saved_professors: updatedSaved })
        .eq("user_id", userId);

      if (savedUpdateError) {
        return res
          .status(400)
          .json({ message: "Could not update saved professors." });
      }
    }

    return res.status(200).json({ message: "Professor saved successfully." });
  } catch (err) {
    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

app.delete("/kanban/remove-saved/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;

  if (!professorId || !userId) {
    return res
      .status(400)
      .json({ message: "Professor ID and User ID is required." });
  }
  try {
    const { error: savedDeletionError } = await supabase
      .from("Saved")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId);

    if (savedDeletionError) {
      return res
        .status(400)
        .json({ message: "Could not delete application data." });
    }

    const { data: savedData, error: savedDataFetchError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (savedDataFetchError) {
      return res.status(400).json({ message: "Failed to Fetch Data" });
    }
    const prevSaved = savedData.saved_professors;
    const newSaved = prevSaved.filter(
      (prof) => String(prof) !== String(professorId)
    );

    if (prevSaved.length !== newSaved.length) {
      const { error: arrayUpdateError } = await supabase
        .from("User_Profiles")
        .update({ saved_professors: newSaved })
        .eq("user_id", userId);
      if (arrayUpdateError) {
        return res
          .status(400)
          .json({ message: "Could not update application data." });
      }
    }

    return res.status(200).json({ message: "Professor removed successfully." });
  } catch (err) {
    console.log(err);

    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

//Saved Endpoints end here
app.post("/github/create-page/:userId", async (req, res) => {
  const { userId } = req.params;
  const { resume } = req.body;
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
