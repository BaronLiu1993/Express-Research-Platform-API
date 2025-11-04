import express from "express";

//External Library Imports
import dotenv from "dotenv";
import { verifyToken } from "../../services/authServices.js";
import { simpleParser } from "mailparser";
import { configureOAuth } from "../../services/googleServices.js";

dotenv.config();

const router = express.Router();

router.get("/get-threads", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: threadData, error: threadDataFetchError } =
      await req.supabaseClient
        .from("Messages")
        .select("*")
        .eq("user_id", userId)
        .eq("type", "first");

    if (threadDataFetchError) {
      return res
        .status(400)
        .json({ message: "Failed to Fetch Data", success: false });
    }
    return res.status(200).json({
      message: "Got Thread Successfully",
      success: true,
      data: threadData,
    });
  } catch {
    return res
      .status(500)
      .json({ message: "Internal Server Error", success: false });
  }
});

router.get("/get-emails-in-thread", verifyToken, async (req, res) => {
  const { threadId } = req.query;
  const userId = req.user.sub;
  console.log("fired")
  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });
    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "raw",
    });

    const messages = threadData?.data?.messages || [];

    const { data: seenRows } = await req.supabaseClient
      .from("Messages")
      .select("message_id, opened_email, opened_email_at")
      .eq("thread_id", threadId);

    const seenMap = new Map((seenRows || []).map((r) => [r.message_id, r]));

    const messageArray = await Promise.all(
      messages.map(async (m) => {
        const rawMessage = Buffer.from(
          m.raw.replace(/-/g, "+").replace(/_/g, "/"),
          "base64"
        ).toString("utf8");
        const parsed = await simpleParser(rawMessage);
        const seenData = seenMap.get(m.id) || null; 
        return {
          messageId: m.id,
          labels: m.labelIds || [],
          to: parsed.to?.text || null,
          from: parsed.from?.text || null,
          subject: parsed.subject || "(No Subject)",
          body: parsed.text || parsed.html || "",
          htmlBody: parsed.html || null,
          seenData,
          date: parsed.date || null,
          messageIdHeader: parsed.messageId || null,
        };
      })
    );

    console.log(`[Success] Parsed ${messageArray.length} messages`);
    return res.status(200).json({ messageArray });
  } catch (err) {
    console.error("[Error]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;