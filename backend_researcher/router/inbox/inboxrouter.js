//External Library Imports
import { google } from "googleapis";
import express from "express";
import dotenv from "dotenv";
import EmailReplyParser from "email-reply-parser";
import { simpleParser } from "mailparser";

//Google Service Service Layer
import { configureOAuth } from "../../services/googleServices.js";
import { decodeBody } from "../../services/googleServices.js";
import { verifyToken } from "../../services/authServices.js";

dotenv.config();

const router = express.Router();

router.get("/get-seen/:threadId/:messageId", verifyToken, async (req, res) => {
  const { threadId, messageId } = req.params;
  try {
    const { data: messageData, error: messageDataError } =
      await req.supabaseClient
        .from("Messages")
        .select("opened_email, opened_email_at, user_id")
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

router.get("/get-full-email-chain/:threadId", verifyToken, async (req, res) => {
  const { threadId } = req.params;
  const userId = req.user.sub;
  console.log("[Route] /get-full-email-chain called with threadId:", threadId);

  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });
    console.log("[Step] Gmail OAuth configured successfully.");

    console.log("[Step] Fetching thread data...");

    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });
    console.log(
      "[Step] Thread data fetched:",
      threadData?.data?.messages?.length,
      "messages found."
    );

    const messages = threadData?.data?.messages || [];

    console.log("[Step] Parsing individual messages...");
    const messageArray = await Promise.all(
      messages.map(async (message, index) => {
        console.log(`[Message ${index}] Fetching message ID: ${message.id}`);
        const msgData = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "raw",
        });

        const { data: messageData, error: messageDataError } =
          await req.supabaseClient
            .from("Messages")
            .select("opened_email, opened_email_at")
            .eq("thread_id", threadId)
            .eq("message_id", message.id)
            .single();


        const raw = msgData?.data?.raw || "";
        console.log(`[Message ${index}] Raw message length:`, raw.length);

        const buffer = Buffer.from(raw, "base64");
        const parsed = await simpleParser(buffer);
        console.log(`[Message ${index}] Parsed subject:`, parsed.subject);

        const replyParsed = new EmailReplyParser().read(parsed.text || "");
        const visibleBody = replyParsed.getVisibleText();

        return {
          messageId: message.id, 
          labels: message.labelIds || [],
          to: parsed.to?.value?.[0] || {},
          from: parsed.from?.value?.[0] || {},
          subject: parsed.subject || "(No Subject)",
          body: visibleBody,
          seenData: messageData,
          date: parsed.date || null,
        };
      })
    );

    console.log("[Step] All messages parsed successfully. Returning response.");
    return res.status(200).json({ messageArray });
  } catch (err) {
    console.error("[Error] Thread processing error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-email-chain", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: completedData, error: completedFetchError } =
      await req.supabaseClient
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
      .select("student_email, student_name")
      .eq("user_id", userId)
      .single();

    if (tokenFetchError || !tokenData) {
      return res.status(401).json({ message: "Token fetch error" });
    }

    const { data: threadData, error: threadFetchError } =
      await req.supabaseClient
        .from("Emails")
        .select("thread_id, professor_id")
        .eq("user_id", userId)
        .eq("type", "first")
        .in("professor_id", completedProfessorIds);

    if (threadFetchError || !threadData?.length) {
      return res.status(401).json({ message: "Thread fetch error" });
    }

    const { data: professorData, error: professorFetchError } =
      await req.supabaseClient
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
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

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
        userName: tokenData.student_name,
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
  } catch {
    return res.status(500).json({ message: "Failed to fetch Gmail threads." });
  }
});

export default router;
