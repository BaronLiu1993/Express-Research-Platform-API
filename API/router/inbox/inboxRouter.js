import express from "express";

import dotenv from "dotenv";
import { verifyToken } from "../../services/authServices.js";
import { simpleParser } from "mailparser";
import { configureOAuth } from "../../services/googleServices.js";
import { supabase } from "../../supabase/supabase.js";

dotenv.config();

const router = express.Router();

// Update
async function updateInbox({ historyId, email }) {
  try {
    const gmail = await configureOAuth({ userId: "", supabase })
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyId,
    });

    console.log(history.data.history);
    console.log(history.data.history[0].messages);

    
    for (const msg of history.data.history) {
      const threadId = msg.messages[0].threadId;
      console.log(threadId)

      const lastUpdatedAt = new Date().toISOString();
  
      const { error: upsertError } = await supabase
        .from("Messages")
        .update({
          sent_at: lastUpdatedAt,
          unread: true,
        })
        .eq("thread_id", threadId)
        .eq("type", "first");
      
      console.log(upsertError)
    }

    const { error: historyUpdateError } = await supabase
      .from("User_Profiles")
      .update({ history_id: historyId })
      .eq("user_id", "");
    
    console.log(historyUpdateError)
    if (historyUpdateError) {
      throw new Error("Failed To Update History");
    }
  } catch (err) {
    console.log(err);
  }
}

// Add authentication to make sure it is the right person getting this data
router.post("/mail-webhook", async (req, res) => {
  const message = req.body.message;
  try {
    const data = JSON.parse(Buffer.from(message.data, "base64").toString());
    console.log(data)
    // data = { emailAddress: '', historyId:  }
    await updateInbox({ historyId: data.historyId, email: data.emailAddress})
    return res.status(200).json({message: "Succeeded!"});
  } catch {
    return res.status(500).json({ message: "internal server error" });
  }
});

router.get("/get-threads", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const page = Number(req.query.page) || 1;
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
  const { threadId } = req.query;
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
  const { messageId, fromUser } = req.query;
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
