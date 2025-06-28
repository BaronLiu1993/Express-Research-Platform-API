import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import EmailReplyParser from "email-reply-parser";
import { simpleParser } from "mailparser";
import OpenAI from "openai";
import dotenv from "dotenv";
import Mustache from "mustache";
import { DateTime } from "luxon";
import draftQueue from "./queue/draftQueue.js";
import sendQueue from "./queue/sendQueue.js";
import "./queue/sendWorker.js";
import "./queue/draftWorker.js";
import "./pubsub/subListener.js"

//Test only

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
  "https://www.googleapis.com/auth/calendar.readonly",
];

//Helper Functions

//Configure GMAIL Watch
async function setupWatch(userTokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: userTokens.gmail_auth_token,
    refresh_token: userTokens.gmail_refresh_token,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Start watching user's Gmail inbox
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: ["INBOX"],
      topicName: `projects/${process.env.GCP_PROJECT_ID}/topics/gmail-replies`,
    },
  });

  // Save the historyId for future reference (optional)
  return res.data.historyId;
}

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

function makeReplyBody(to, fromName, fromEmail, subject, htmlMessage, inReplyToMessageId = null) {
  const headers = [
    `To: ${to}`,
    `From: ${fromName} <${fromEmail}>`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ];

  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`);
    headers.push(`References: ${inReplyToMessageId}`);
  }

  const mimeMessage = [...headers, "", htmlMessage].join("\n");

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

//Replace this soon with library
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

function removeCurlyBraces(input) {
  return input.replace(/[{}]/g, "");
}

//for UI only
app.get("/get-all-snippets/:userId", async (req, res) => {
  const { userId } = req.params
  try {
    const { data: snippetData, error: snippetFetchError} = await supabase
      .from("snippets")
      .select("snippet_name, snippet_subject, snippet_html")
      .eq("user_id", userId)
    
      if (snippetFetchError) {
        return res.status(400).json({message: "Failed to Fetch Data"})
      }

      return res.status(201).json({message: snippetData})
  } catch {
    return res.status(500).json({ message: "Internal Server Error"})
  }
})



app.get("/get-publications/:professorId", async (req, res) => {
  const { professorId } = req.params;
  try {
    const { data: publicationsData, error: publicationsFetchError } =
      await supabase
        .from("Publications")
        .select("id, title, link, publication_type, publication_date")
        .eq("professor_id", professorId);
    if (publicationsFetchError) {
      return res
        .status(400)
        .json({ message: "Failed to Fetch Professor Data" });
    }

    return res.status(200).json({ publicationsData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});



app.post("/sync-fetchable-variables/:userId", async (req, res) => {
  const { variableArray, professorIdArray } = req.body;
  const { userId } = req.params;

  if (!Array.isArray(variableArray) || !Array.isArray(professorIdArray)) {
    return res.status(400).json({ message: "Invalid input arrays" });
  }

  if (variableArray.length === 0 || professorIdArray.length === 0) {
    return res.status(400).json({ message: "User Sent Nothing" });
  }

  const newVariableArray = variableArray.map(removeCurlyBraces);
  const result = [];

  try {
    for (let i = 0; i < professorIdArray.length; i++) {
      const professorId = professorIdArray[i];

      const { data: constantData, error: constantError } = await supabase
        .from("Taishan")
        .select("id, email")
        .eq("id", professorId)
        .single();
      if (constantError) throw constantError;

      const filteredFields = newVariableArray.filter(
        (v) => v !== "publications"
      );

      let variableData = {};
      if (filteredFields.length > 0) {
        const { data, error: variableError } = await supabase
          .from("Taishan")
          .select(filteredFields.join())
          .eq("id", professorId)
          .single();
        if (variableError) throw variableError;
        variableData = data || {};
      }

      let publicationData;
      if (newVariableArray.includes("publications")) {
        const { data, error } = await supabase.rpc("match_publications", {
          student_id_param: userId,
          professor_id_param: professorId,
          match_threshold_param: 0.2,
          match_count_param: 1,
        });

        if (error) throw error;
        publicationData = data?.[0]?.title || "";
      }

      const dynamicFields = {};
      if (Object.keys(variableData).length > 0) {
        Object.assign(dynamicFields, variableData);
      }
      if (publicationData !== undefined) {
        dynamicFields.publications = publicationData;
      }

      const resultEntry = {
        id: constantData.id,
        email: constantData.email,
      };
      if (Object.keys(dynamicFields).length > 0) {
        resultEntry.dynamicFields = dynamicFields;
      }

      result.push(resultEntry);
    }

    return res.status(200).json({ result, status: "synced" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal Server Error",
      status: "failed",
    });
  }
});

//finish queue and then send everything after human review and AI bubble menu
//Ensure that it is all sending and everything is moving around in supabase and the right things are going 
//to the right places QA testing after this essentially and work on the AI bubble menu
app.post("/gmail/mass-send", async(req, res) => {
  const { userId, userEmail, userName, professorData} = req.body
  //Array of professorIdArray
  try {
    const jobs = professorData.map(professor => ({
      name: "send-email",
      data: {
        userId,
        userEmail,
        userName,
        body: {
          professorId: professor.id,
          professorEmail: professor.email,
          professorName: professor.name
        }
      }
    }))
    console.log(jobs)
    console.log(jobs[0])
    const addedJobs = await sendQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
})

app.post("/gmail/snippet-create-draft", async (req, res) => {
  const { userId, professorData, baseBody } = req.body;
  console.log(professorData)
  try {
    const jobs = professorData.map((professor) => ({
      name: "generate-draft",
      data: {
        userId,
        professorId: professor.id,
        body: {
          ...baseBody,
          dynamicFields: professor.dynamicFields,
          to: professor.email,
        },
      },
    }));
    const addedJobs = await draftQueue.addBulk(jobs);
    console.log(jobs);
    console.log(jobs[0].data);
    console.log(jobs[0].data.body.dynamicFields);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

function cleanSnippetPlaceholders(str) {
  return str.replace(/\/(?=\{\{)/g, '');
}

//Put Snippet in There
app.post("/snippets/insert/:userId", async (req, res) => {
  const { userId } = req.params;
  const { snippet_html, snippet_subject } = req.body;

  const parsedSnippetHtml = cleanSnippetPlaceholders(snippet_html)
  try {
    const { data: insertionData, error: insertionError } = await supabase
      .from("snippets")
      .insert({
        user_id: userId,
        snippet_html: parsedSnippetHtml,
        snippet_subject: snippet_subject,
        snippet_name: "Test",
      })
      .select("id")
      .single();
    const snippetId = insertionData.id
    return res.status(200).json({ snippetId });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/snippets/get-all/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: getData, error: getError } = await supabase
      .from("snippets")
      .select("id, snippet_html, snippet_subject")
      .eq("user_id", userId);
    return res.status(200).json({ message: getData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

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

app.get("/gcalendar/availability/:userId", async (req, res) => {
  const { userId } = req.params;
  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select("gmail_auth_token, gmail_refresh_token")
    .eq("user_id", userId)
    .single();
  if (tokenFetchError || !tokenData) {
    return res.status(401).json({});
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    /*
    const now = new Date()
    const twoWeeksLater = new Date()
    twoWeeksLater.setDate(now.getDate() + 14)
     */

    const now = new Date("2025-01-20T00:00:00-05:00"); // EST (UofT timezone)
    const twoWeeksLater = new Date("2025-02-03T00:00:00-05:00");

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items.map((event) => ({
      id: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
    }));
    return res.status(200).json({ events });
  } catch {}
});

//Tracking and Analytics
//Change URL later so that it is less suspicious for engagement
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
  setupWatch(code)
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

app.post(
  "/gmail/create-follow-up-draft/:userId/:professorId/:threadId",
  async (req, res) => {
    const { userId, professorId, threadId } = req.params;
    const { to, fromName, fromEmail, subject, message } = req.body;

    console.log("📥 Request Params:", { userId, professorId, threadId });
    console.log("📥 Request Body:", { to, fromName, fromEmail, subject });

    if (!to || !fromName || !fromEmail) {
      console.error("❌ Missing required fields");
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Fetch Gmail auth tokens
    const { data: tokenData, error: fetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (fetchError || !tokenData) {
      console.error("❌ Failed to fetch token data:", fetchError);
      return res.status(401).json({ message: "Auth tokens not found" });
    }

    console.log("🔐 Setting OAuth2 credentials");
    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    try {
      console.log("🔄 Refreshing access token");
      await oauth2Client.getAccessToken();

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      console.log("📨 Fetching thread to reply to:", threadId);
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
      });

      const messages = thread.data.messages;
      const lastMessage = messages[messages.length - 1];
      console.log("📨 Last message found:", lastMessage?.id);

      const messageIdHeader = lastMessage.payload.headers.find(
        (h) => h.name === "Message-ID"
      );
      const inReplyTo = messageIdHeader?.value;
      console.log("📌 In-Reply-To header:", inReplyTo);

      const trackingId = uuidv4();
      const raw = makeReplyBody(
        to,
        fromName,
        fromEmail,
        subject,
        message,
        inReplyTo
      );

      console.log("📦 Creating draft");
      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw, threadId } },
      });

      console.log("📝 Draft created:", draft.data.id);

      const { error: insertionError } = await supabase.from("Emails").insert([
        {
          user_id: userId,
          professor_id: parseInt(professorId),
          draft_id: draft.data.id,
          type: "FollowUp",
          tracking_id: trackingId,
        },
      ]);

      if (insertionError) {
        console.error("❌ Supabase insertion error:", insertionError);
        return res.status(400).json({ message: "Insertion Error" });
      }

      console.log("✅ Follow-up draft created successfully");
      return res.status(200).json({ draftId: draft.data.id });
    } catch (error) {
      console.error("❌ Internal error:", error);
      return res.status(500).json({ message: "Internal Server Error", error });
    }
  }
);


app.post("/gmail/send-follow-up/:userId/:draftId/:trackingId", async (req, res) => {
  const { userId, draftId, trackingId } = req.params;

  try {
    const { data: tokenData, error: tokenFetchError } = await supabase
      .from("User_Profiles")
      .select("gmail_auth_token, gmail_refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenFetchError || !tokenData) {
      return res.status(400).json({ error: "Missing or invalid tokens" });
    }

    oauth2Client.setCredentials({
      access_token: tokenData.gmail_auth_token,
      refresh_token: tokenData.gmail_refresh_token,
    });

    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const sendResponse = await gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftId,
      },
    });


    const { threadId, id: messageId } = sendResponse.data;

    await supabase
      .from("Emails")
      .update({
        thread_id: threadId,
        sent_at: new Date().toISOString(),
        sent: true,
      })
      .eq("draft_id", draftId);

    await supabase.from("Messages").insert({
      thread_id: threadId,
      message_id: messageId,
      tracking_id: trackingId,
      type: "FollowUp",
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[SEND] Follow-up send error:", err);
    return res.status(500).json({ message: "Failed To Send" });
  }
});


app.get(
  "/gmail/resume-follow-up-draft/:userId/:professorId",
  async (req, res) => {
    //Params to get the draft data
    const { userId, professorId } = req.params;

    //Draft Data
    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "FollowUp")
      .eq("sent", false)
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

      //Parsing the payload and breaking it down
      const payload = draft.data.message.payload;
      const headers = payload.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const htmlBody = extractHtmlOrPlainText(payload);
      console.log(payload)
      return res.status(200).json({
        tracking_id: draftData.tracking_id,
        draft_id: draftData.draft_id,
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
  }
);

app.delete(
  "/gmail/delete-follow-up-draft/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    try {
      const { error: draftDeleteError } = await supabase
        .from("Emails")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId)
        .eq("type", "FollowUp")
        .eq("sent", false)
        .single();

      if (draftDeleteError) {
        return res.status(400).json({ message: "Failed To Delete" });
      }
    } catch {
      return res.status(500).json({ message: "Internal Server Errors" });
    }
  }
);

app.put(
  "/gmail/update-follow-up-draft/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    const { to, fromName, fromEmail, subject, body } = req.body;
    console.log(to)
    console.log(fromName)
    console.log(fromEmail)
    console.log(subject)
    console.log(body)
    console.log(userId)
    console.log(professorId)



    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "FollowUp")
      .eq("sent", false)
      .single()
    
    console.log(draftData)


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
      console.log(err)
      return res.status(500).json({ updated: false });
    }
  }
);

app.post("/gmail/create-reply-draft/:userId/professorId", async (req, res) => {
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
        type: "Reply",
        //Sent should automatically be false
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

app.get("/gmail/resume-reply-draft/:userId/:professorId", async (req, res) => {
  //Params to get the draft data
  const { userId, professorId } = req.params;

  //Draft Data
  const { data: draftData, error: draftFetchError } = await supabase
    .from("Emails")
    .select("draft_id")
    .eq("user_id", userId)
    .eq("professor_id", professorId)
    .eq("type", "Reply")
    .eq("sent", false)
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

app.delete(
  "/gmail/delete-reply-draft/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    try {
      const { error: draftDeleteError } = await supabase
        .from("Emails")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId)
        .eq("type", "Reply")
        .eq("sent", false)
        .single();

      if (draftDeleteError) {
        return res.status(400).json({ message: "Failed To Delete" });
      }
    } catch {
      return res.status(500).json({ message: "Internal Server Errors" });
    }
  }
);

app.put(
  "/gmail/update-follow-up-draft/:userId/:professorId/:threadId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    const { to, fromName, fromEmail, subject, body } = req.body;

    const { data: draftData, error: draftFetchError } = await supabase
      .from("Emails")
      .select("draft_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "Reply")
      .eq("sent", false)
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
      return res.status(500).json({ updated: false });
    }
  }
);

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
        type: "First",
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

//Require someone to delete the workflow first and then restart again

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

app.delete("/gmail/delete-draft/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  try {
    const { error: draftDeleteError } = await supabase
      .from("Emails")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "First")
      .eq("sent", false)
      .single();

    if (draftDeleteError) {
      return res.status(400).json({ message: "Failed To Delete" });
    }
  } catch {
    return res.status(500).json({ message: "Internal Server Errors" });
  }
});

app.put(
  "/gmail/add-tracking-pixel-first/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    const { to, fromName, fromEmail, subject } = req.body;

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
        .eq("type", "First")
        .eq("sent", false)
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
      const fetchDraft = await gmail.users.drafts.get({
        userId: "me",
        id: draftIdData.draft_id,
      });
      let emailHtml = decodeBody(fetchDraft.data.message.payload.body.data);
      //Construct Tracking Pixel
      const trackingPixel = `<img src="https://test-q97b.onrender.com/pixel.png?analyticId=${draftIdData.tracking_id}" width="1" height="1" style="display:none;" />`;
      emailHtml += trackingPixel;
      console.log(emailHtml);

      //Rebuild Email
      const raw = makeBody(to, fromName, fromEmail, subject, emailHtml);

      const draft = await gmail.users.drafts.update({
        userId: "me",
        id: draftIdData.draft_id,
        requestBody: { message: { raw } },
      });

      return res.status(200).json({ updated: true });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

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
        .eq("type", "First")
        .eq("sent", false)
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

      if (!inProgressFetchError) {
        const { error: insertionError } = await supabase
          .from("Completed")
          .insert(inProgressData);

        const { error: deletionError } = await supabase
          .from("InProgress")
          .delete()
          .eq("user_id", userId)
          .eq("professor_id", professorId);

        if (insertionError || deletionError) {
          return res
            .status(400)
            .json({ message: "Kanban Deletion or Insertion Error" });
        }
      }

      await supabase
        .from("Emails")
        .update({
          thread_id: sendResponse.data.threadId,
          sent_at: new Date().toISOString(),
          sent: true,
        })
        .eq("user_id", userId)
        .eq("professor_id", professorId)
        .eq("type", "First");

      await supabase.from("Messages").insert({
        thread_id: sendResponse.data.threadId,
        message_id: sendResponse.data.id,
        tracking_id: draftIdData.tracking_id,
        type: "First",
      });

      //add error handling and a response back

      return res.status(200).json({});
    } catch (err) {
      return res.status(500).json({});
    }
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

app.get("/gmail/get-seen/:threadId/:messageId", async (req, res) => {
  const { threadId, messageId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await supabase
      .from("Messages")
      .select("opened_email, opened_email_at")
      .eq("thread_id", threadId)
      .eq("message_id", messageId)
      .single();

    if (messageDataError) {
      return res.status(400).json({ opened: false, opened_at: "Not Opened" });
    }

    return res.status(200).json({
      opened_email: messageData.opened_email,
      opened_email_at: messageData.opened_email_at,
    });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/gmail/get-status/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await supabase
      .from("Completed")
      .select("status")
      .eq("user_id", userId )
      .eq("professor_id", professorId)
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

  const { data: tokenData, error: tokenFetchError } = await supabase
    .from("User_Profiles")
    .select(
      "gmail_auth_token, gmail_refresh_token, student_email, student_lastname, student_firstname"
    )
    .eq("user_id", userId)
    .single();
  if (tokenFetchError || !tokenData) {
    return res.status(401).json({ error: "Token fetch error" });
  }



  const { data: threadData, error: threadFetchError } = await supabase
    .from("Emails")
    .select("thread_id, professor_id")
    .eq("user_id", userId)
    .eq("type", "first")
    .in("professor_id", completedProfessorIds);
 
  if (threadFetchError) {
    return res.status(401).json({ error: "Thread fetch error" });
  }

  const { data: professorData, error: professorFetchError } = await supabase
    .from("Taishan")
    .select("id, name, email")
    .in("id", completedProfessorIds);

  if (professorFetchError || !professorData?.length) {
    return res.status(401).json({ message: "Professor data fetch error" });
  }

  const professorMap = {};
  for (const prof of professorData) {
    professorMap[prof.id] = prof;
  }

  oauth2Client.setCredentials({
    access_token: tokenData.gmail_auth_token,
    refresh_token: tokenData.gmail_refresh_token,
  });

  try {
    await oauth2Client.getAccessToken();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const threadArray = [];

    for (const threadEntry of threadData) {
      const { thread_id, professor_id } = threadEntry;
      const professor = professorMap[professor_id];

      if (!professor) continue;

      const thread = await gmail.users.threads.get({
        userId: "me",
        id: thread_id,
      });

      console.log(thread?.data?.messages[0])
      const headers = thread?.data?.messages[0]?.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      //const body = decodeBody(thread.data.messages[0]?.payload?.body?.data || "") || "";
      const body = thread?.data?.messages[0].snippet

      const threadObject = {
        userName: `${tokenData.student_firstname} ${tokenData.student_lastname}`,
        userEmail: tokenData.student_email,
        professorEmail: professor.email,
        professorId: professor.id,
        threadId: thread_id,
        messageId: thread.data.messages[0].id,
        thread_title: professor.name,
        firstMessageData: {
          subject: subject.length > 40 ? `${subject.slice(0, 40)}...` : subject,
          date: date,
          body: body.length > 40 ? `${body.slice(0, 40)}...` : body,
        },
      };

      threadArray.push(threadObject);
    }

    return res.status(200).json({ threadArray });
  } catch (err) {
    console.error("Gmail fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch Gmail threads." });
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
    console.error("❌ Token fetch error:", tokenFetchError);
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

    const messages = threadData?.data?.messages || [];
    const messageArray = [];

    // Step 4: Loop through each message
    for (const message of messages) {
      const labels = message.labelIds || [];

      // Fetch full message content
      const messageData = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "raw",
      });

      const decoded = decodeBody(messageData.data.raw);

      const parsed = await simpleParser(decoded);

      if (!parsed.text && !parsed.html && !parsed.textAsHtml) {
        continue;
      }

      const rawText = parsed.text || parsed.html || parsed.textAsHtml || "";
      const email = new EmailReplyParser().read(rawText);
      const body = email.getVisibleText();

      if (!body || body.trim().length === 0) {
        continue;
      }

      // Parse headers
      const to = parsed.to?.value?.[0] || null;
      const from = parsed.from?.value?.[0] || null;
      const subject = parsed.subject || "";
      const date = parsed.date || "";

      if (!to || !from) {
        continue;
      }

      messageArray.push({
        labels,
        to,
        from,
        subject,
        body,
        date,
      });
    }

    return res.status(200).json({ messageArray });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
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

app.get("/match-professors", async (req, res) => {
  const { userId } = req.query;
  const match_count = 10;
  const match_threshold = 0.2;

  try {
    const { data: matches, error: matchesFetchError } = await supabase.rpc(
      "match_professors_for_student",
      {
        student_id: userId,
        match_threshold,
        match_count,
      }
    );
    if (matchesFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }

    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
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

//filter
app.get("/taishan/filter", async (req, res) => {
  const { page = 1, ...filters } = req.query;
  const pageNumber = parseInt(page);
  const limit = 20;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = supabase
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      );

    for (const [key, rawValue] of Object.entries(filters)) {
      if (key === "page") continue;
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      const cleanValues = values.map((v) => v.trim()).filter(Boolean);
      if (cleanValues.length > 0) {
        query = query.in(key, cleanValues);
      }
    }

    query = query.range(from, to);
    const { data: tableData, error } = await query;

    if (error) {
      console.error(error);
      return res.status(400).json({ message: "Failed To Fetch Filtered Data" });
    }

    return res.status(200).json({ tableData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/taishan", async (req, res) => {
  const { page, search } = req.query;
  const pageNumber = parseInt(page) || 1;
  const limit = 20;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;
  const pageOffset = (pageNumber - 1) * limit;

  if (typeof search === "string" && search.trim() !== "") {
    try {
      //Begin by Sanitizing Input
      let cleanedSearch = search.trim().replace(/\s+/g, " ");

      if (/[^a-zA-Z0-9.,!?()'\s]/.test(search)) {
        return res
          .status(400)
          .json({ message: "Search contains invalid characters." });
      }

      if (cleanedSearch.length > 40) {
        return res.status(400).json({ message: "Invalid or too long input" });
      }

      const embeddingResult = await OPEN_AI.embeddings.create({
        model: "text-embedding-3-large",
        input: cleanedSearch,
      });

      const embedding = embeddingResult.data[0].embedding;

      const { data: tableData, error: semanticSearchError } =
        await supabase.rpc("find_similar_professors_by_vector", {
          student_embedding: embedding,
          match_threshold: 0.2,
          page_size: limit,
          page_offset: pageOffset,
        });

      if (semanticSearchError) {
        return res.status(400).json({ message: "Supabase Fetch Error" });
      }

      return res.status(200).json({
        tableData,
        tableCount: tableData.length,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  try {
    const {
      data: tableData,
      count: tableCount,
      error: tableFetchError,
    } = await supabase
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      )
      .range(from, to);

    if (tableFetchError) {
      console.error(tableFetchError);
      return res.status(400).json({ message: "Failed to Fetch Table Data" });
    }

    return res.status(200).json({ tableData, tableCount });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
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

//Finish these
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
  console.log(email)
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
