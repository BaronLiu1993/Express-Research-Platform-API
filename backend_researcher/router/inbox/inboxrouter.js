//Supabase Client Import
import { supabase } from "../../supabase/supabase.js";

//External Library Imports
import { google } from "googleapis";
import express from "express";
import dotenv from "dotenv";
import EmailReplyParser from "email-reply-parser";
import { simpleParser } from "mailparser";

//Google Service Service Layer
import { decodeBody } from "../../services/googleServices.js";

dotenv.config();

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

router.get("/get-engagement/:threadId/:messageId", async (req, res) => {
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

router.get("/get-seen/:threadId/:messageId", async (req, res) => {
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

router.get("/get-status/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await supabase
      .from("Completed")
      .select("status")
      .eq("user_id", userId)
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


//Get the Base Emails for Display
router.get("/get-full-email-chain/:userId/:threadId", async (req, res) => {
  const { userId, threadId } = req.params;

  // Step 1: Get Gmail tokens
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
    // Refresh token if needed
    await oauth2Client.getAccessToken();

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Step 2: Get thread
    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = threadData?.data?.messages || [];
    const messageArray = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (!message?.id) {
        console.warn(`Skipping message without ID at index ${i}`);
        continue;
      }

      try {
        const messageData = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "raw",
        });

        const raw = messageData?.data?.raw;

        if (!raw) {
          console.warn(`Skipping message ${message.id}: Missing raw content`);
          continue;
        }

        const decoded = decodeBody(raw);
        const parsed = await simpleParser(decoded);
        const replyParsed = new EmailReplyParser().read(parsed.text || "");
        const visibleBody = replyParsed.getVisibleText();

        const to = parsed.to?.value?.[0] || {};
        const from = parsed.from?.value?.[0] || {};
        const subject = parsed.subject || "(No Subject)";
        const date = parsed.date || null;
        const labels = message.labelIds || [];

        const messageObj = {
          labels,
          to,
          from,
          subject,
          body: visibleBody,
          date,
        };

        messageArray.push(messageObj);
      } catch (msgErr) {
        console.warn(`Failed to parse message ${message.id}: ${msgErr.message}`);
        continue;
      }
    }

    return res.status(200).json({ messageArray });
  } catch (err) {
    console.error("Thread processing error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


//Get the Full Individual Email Chains
router.get("/get-email-chain/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log(userId)
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

  if (threadFetchError || !threadData?.length) {
    return res.status(401).json({ error: "Thread fetch error" });
  }

  const { data: professorData, error: professorFetchError } = await supabase
    .from("Taishan")
    .select("id, name, email")
    .in("id", completedProfessorIds);

  if (professorFetchError || !professorData?.length) {
    return res.status(401).json({ error: "Professor data fetch error" });
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

      const headers = thread?.data?.messages[0]?.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      const body =
        decodeBody(thread.data.messages[0]?.payload?.body?.data || "") || "";

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
    console.log(threadArray)
    return res.status(200).json({ threadArray });
  } catch (err) {
    console.error("Gmail fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch Gmail threads." });
  }
});

export default router;
