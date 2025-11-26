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
  // Only get the first 5 and then infinite load down if needed
  //Get the entire email preview, but each has the messageId to get the draft
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
  const { messageId } = req.query;
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

    return res.status(200).json({ html, text });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-emails-in-thread", verifyToken, async (req, res) => {
  const { threadId } = req.query;
  const userId = req.user.sub;
  const getHeader = (headers = [], name) =>
    headers.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())
      ?.value || null;

  const decodeBase64Url = (s) => {
    if (typeof s !== "string") return null;
    try {
      const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(base64, "base64").toString("utf8");
    } catch {
      return null;
    }
  };

  const extractBodyData = (payload) => {
    if (!payload) return { mimeType: null, data: null };

    if (payload.body?.data) {
      return { mimeType: payload.mimeType || null, data: payload.body.data };
    }

    const parts = Array.isArray(payload.parts) ? payload.parts : [];
    if (parts.length === 0) return { mimeType: null, data: null };

    let candidate =
      parts.find((p) => p.mimeType === "text/html" && p.body?.data) ||
      parts.find((p) => p.mimeType === "text/plain" && p.body?.data) ||
      parts.find((p) => p.body?.data);

    if (!candidate) {
      for (const p of parts) {
        const inner = extractBodyData(p);
        if (inner?.data) return inner;
      }
      return { mimeType: null, data: null };
    }

    return {
      mimeType: candidate.mimeType || null,
      data: candidate.body.data || null,
    };
  };

  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = threadData?.data?.messages || [];

    const { data: seenRows } = await req.supabaseClient
      .from("Messages")
      .select("opened_email, opened_email_at, identifier_id")
      .eq("thread_id", threadId);

    const messageArray = (
      await Promise.all(
        messages.map(async (m) => {
          const headers = m?.payload?.headers || [];

          const messageIdHeader = getHeader(headers, "Message-ID");
          const subject = getHeader(headers, "Subject") || "(No Subject)";
          const to = getHeader(headers, "To");
          const from = getHeader(headers, "From");
          const date = getHeader(headers, "Date");

          const { data: base64UrlData } = extractBodyData(m?.payload);

          let bodyStr = null;
          if (Buffer.isBuffer(base64UrlData)) {
            bodyStr = base64UrlData.toString("utf8");
          } else {
            bodyStr = decodeBase64Url(base64UrlData);
          }

          let parsedBody = bodyStr || "";
          if (bodyStr) {
            const parsed = await simpleParser(Buffer.from(bodyStr, "utf8"));
            parsedBody = parsed.html || parsed.text || bodyStr || "";
          }

          const seenData = seenMap.get(m.id) || null;

          return {
            id: m.id,
            threadId,
            to,
            from,
            date,
            subject,
            body: parsedBody,
            seenData,
            messageIdHeader: messageIdHeader || null,
          };
        })
      )
    ).filter(Boolean);

    return res.status(200).json({ messageArray });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
