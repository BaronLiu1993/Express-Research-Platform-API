//External Library Imports
import { google } from "googleapis";
import express from "express";
import dotenv from "dotenv";
import EmailReplyParser from "email-reply-parser";
import { simpleParser } from "mailparser";

//Google Service Service Layer
import { decodeBody } from "../../services/googleServices.js";
import { verifyToken } from "../../services/authServices.js";

dotenv.config();

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

router.get("/get-engagement/:threadId/:messageId", verifyToken, async (req, res) => {
  const { threadId, messageId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await req.supabaseClient
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

router.get("/get-seen/:threadId/:messageId", verifyToken, async (req, res) => {
  const { threadId, messageId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await req.supabaseClient
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

router.get("/get-status/:userId/:professorId", verifyToken, async (req, res) => {
  const { userId, professorId } = req.params;
  try {
    const { data: messageData, error: messageDataError } = await req.supabaseClient
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


router.get("/get-full-email-chain/:userId/:threadId", verifyToken, async (req, res) => {
  const { threadId } = req.params;
  const userId = req.user.sub
  const { data: tokenData, error: tokenFetchError } = await req.supabaseClient
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
      format: "full",
    });

    const messages = threadData?.data?.messages || [];

    const messageArray = await Promise.all(
      messages.map(async (message) => {
        const msgData = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "raw", 
        });

        const raw = msgData?.data?.raw || "";
        const buffer = Buffer.from(raw, "base64");
        const parsed = await simpleParser(buffer);

        const replyParsed = new EmailReplyParser().read(parsed.text || "");
        const visibleBody = replyParsed.getVisibleText();

        return {
          labels: message.labelIds || [],
          to: parsed.to?.value?.[0] || {},
          from: parsed.from?.value?.[0] || {},
          subject: parsed.subject || "(No Subject)",
          body: visibleBody,
          date: parsed.date || null,
        };
      })
    );

    return res.status(200).json({ messageArray });
  } catch (err) {
    console.error("Thread processing error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});



//Get the Full Individual Email Chains
router.get("/get-email-chain/:userId", async (req, res) => {
  const userId = req.user.sub
  const { data: completedData, error: completedFetchError } = await req.supabaseClient
    .from("Completed")
    .select("professor_id")
    .eq("user_id", userId);

  if (completedFetchError || !completedData?.length) {
    return res
      .status(401)
      .json({ error: "Error fetching completed professors" });
  }

  const completedProfessorIds = completedData.map((row) => row.professor_id);

  const { data: tokenData, error: tokenFetchError } = await req.supabaseClient
    .from("User_Profiles")
    .select(
      "gmail_auth_token, gmail_refresh_token, student_email, student_lastname, student_firstname"
    )
    .eq("user_id", userId)
    .single();

  if (tokenFetchError || !tokenData) {
    return res.status(401).json({ error: "Token fetch error" });
  }

  const { data: threadData, error: threadFetchError } = await req.supabaseClient
    .from("Emails")
    .select("thread_id, professor_id")
    .eq("user_id", userId)
    .eq("type", "first")
    .in("professor_id", completedProfessorIds);

  if (threadFetchError || !threadData?.length) {
    return res.status(401).json({ error: "Thread fetch error" });
  }

  const { data: professorData, error: professorFetchError } = await req.supabaseClient
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
