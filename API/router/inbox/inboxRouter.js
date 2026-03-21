import express from "express";

import dotenv from "dotenv";
import { verifyToken } from "../../services/authServices.js";
import { simpleParser } from "mailparser";
import { configureOAuth } from "../../services/googleServices.js";
import { verifyPubSubJwt } from "../../services/authServices.js";
import inboxQueue from "../../queue/inbox/inboxQueue.js";
import { ThreadIdSchema, PageSchema, GetEmailQuerySchema } from "../../schema/inboxSchema.js";

dotenv.config();

const router = express.Router();

router.post("/mail-webhook", async (req, res) => {
  console.log("/mail-webhook HIT");
  console.log("Body:", req.body);
  await verifyPubSubJwt(req, res);

  const message = req.body?.message;
  if (!message?.data) {
    console.log("Missing message.data");
    return res.status(400).json({ error: "Invalid PubSub payload" });
  }

  try {
    const decoded = Buffer.from(message.data, "base64").toString();
    const pubSubData = JSON.parse(decoded);
    await inboxQueue.add("inbox-sync", {
      historyId: pubSubData.historyId,
      email: pubSubData.emailAddress,
    });

    console.log(`[INBOX SYNC] Job Added to Queue ${pubSubData.emailAddress}`);

    return res.status(200).json({ message: "Finished Update" });
  } catch (err) {
    return res.status(500).json({ message: "internal server error" });
  }
});

router.post("/seen", verifyToken, async (req, res) => {
  const queryParsed = ThreadIdSchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ message: "Invalid thread ID" });
  }
  const { threadId } = queryParsed.data;
  try {
    const { error: updateError } = await req.supabaseClient
      .from("Messages")
      .update({ unread: false })
      .eq("thread_id", threadId)
      .eq("type", "first");

    if (updateError) {
      return res.status(400).json({ message: "Failed to update" });
    }

    return res.status(200).json({ message: "Seen Data" });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-threads", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const pageParsed = PageSchema.safeParse(req.query);
  const page = pageParsed.success ? pageParsed.data.page : 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  try {
    const { data, error } = await req.supabaseClient
      .from("Messages")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "first")
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to fetch messages",
      });
    }

    const { count } = await req.supabaseClient
      .from("Messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "first");

    return res.status(200).json({
      success: true,
      data,
      page,
      totalPages: Math.ceil(count / limit),
      totalCount: count,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/get-email-previews", verifyToken, async (req, res) => {
  const threadParsed = ThreadIdSchema.safeParse(req.query);
  if (!threadParsed.success) {
    return res.status(400).json({ message: "Invalid thread ID" });
  }
  const { threadId } = threadParsed.data;
  const userId = req.user.sub;
  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const messages = threadData.data.messages || [];

    return res.status(200).json({ messages });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-email", verifyToken, async (req, res) => {
  const emailParsed = GetEmailQuerySchema.safeParse(req.query);
  if (!emailParsed.success) {
    return res.status(400).json({ message: "Invalid query parameters" });
  }
  const { messageId, fromUser } = emailParsed.data;
  const userId = req.user.sub;

  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "raw",
    });

    const rawBuffer = Buffer.from(message.data.raw, "base64url");
    const parsed = await simpleParser(rawBuffer);
    const html = parsed.html || null;
    const text = parsed.text || null;

    if (fromUser == "true") {
      const { data: seenData, error: seenFetchError } = await req.supabaseClient
        .from("Messages")
        .select("opened_email, opened_email_at")
        .eq("identifier_id", messageId)
        .single();
      if (seenFetchError) {
        return res.status(400).json({
          message: "Failed to fetch messages",
        });
      }

      return res.status(200).json({ html, text, seenData });
    }
    return res.status(200).json({ html, text });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
