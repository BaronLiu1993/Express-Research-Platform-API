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


router.get("/get-emails-in-thread", verifyToken, async (req, res) => {
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
    });

    const messages = threadData?.data?.messages || [];
    const { data: seenRows } = await req.supabaseClient
      .from("Messages")
      .select("opened_email, opened_email_at, identifier_id")
      .eq("thread_id", threadId);
    const seenMap = new Map((seenRows || []).map((r) => [r.identifier_id, r]));
    const messageArray = await Promise.all(
      messages.map(async (m) => {
        let base64UrlData = m.payload.parts[1].body.data;
        if (Buffer.isBuffer(base64UrlData)) {
          base64UrlData = base64UrlData.toString("utf8");
        }

        const headers = m.payload.headers;
        const parentMessageIdHeader = headers.find(
          (h) => h.name.toLowerCase() === "message-id"
        ).value;
        const subject = headers.find((header) => header.name === "Subject");
        const to = headers.find((header) => header.name === "To");
        const from = headers.find((header) => header.name === "From");
        const date = headers.find((header) => header.name === "Date");

        if (typeof base64UrlData === "string") {
          const base64Data = base64UrlData
            .replace(/-/g, "+")
            .replace(/_/g, "/");
          const buffer = Buffer.from(base64Data, "base64");
          const parsed = await simpleParser(buffer);
          const seenData = seenMap.get(m.id) || null;
          return {
            id: m.id,
            to: to.value || null,
            threadId: threadId,
            date: date.value,
            from: from.value || null,
            subject: subject.value || "(No Subject)",
            body: parsed.headerLines[0].line || "",
            seenData: seenData || null,
            messageIdHeader: parentMessageIdHeader || null,
          };
        }
      })
    );

    return res.status(200).json({ messageArray });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
