import express from "express";
import draftQueue from "../../queue/draft/draftQueue.js";
import sendQueue from "../../queue/send/sendQueue.js";
import { verifyToken } from "../../services/authServices.js";
import { configureOAuth } from "../../services/googleServices.js";
import { simpleParser } from "mailparser";

const router = express.Router();

router.post("/create-draft", verifyToken, async (req, res) => {
  const { professorData, baseBody } = req.body;
  const userId = req.user.sub;
  try {
    const jobs = professorData.map((professor) => ({
      name: "generate-draft",
      data: {
        userId,
        professorId: professor.id,
        accessToken: req.token,
        body: {
          ...baseBody,
          dynamicFields: professor.dynamicFields,
          to: professor.email,
          toName: professor.name,
        },
      },
    }));
    await draftQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/send", verifyToken, async (req, res) => {
  const { userEmail, userName, professorData } = req.body;
  const userId = req.user.sub;

  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email",
      data: {
        userId,
        userEmail,
        userName,
        accessToken: req.token,
        body: {
          professorId: professor.id,
          professorEmail: professor.email,
          professorName: professor.name,
        },
      },
    }));
    await sendQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.get("/get-drafts", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: draftsData, error: draftError } = await req.supabaseClient
      .from("Emails")
      .select("*")
      .eq("user_id", userId);
    console.log(draftsData);
    if (draftError) {
      return res.status(400).json({ message: "Failed To Fetch Drafts" });
    }

    return res.status(200).json({ data: draftsData });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.get("/get-singular-draft", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { draftId } = req.query;
  console.log(draftId);

  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    const draft = await gmail.users.drafts.get({
      userId: "me",
      id: draftId,
    });

    let base64UrlData = draft.data.message.payload.parts[1].body.data;
    const headers = draft.data.message.payload.headers;
    const subject = headers.find((header) => header.name === "Subject");

    if (Buffer.isBuffer(base64UrlData)) {
      base64UrlData = base64UrlData.toString("utf8");
    }

    if (typeof base64UrlData !== "string") {
      return res.status(400).json({ message: "Failed to Parse" });
    }
    const base64Data = base64UrlData.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64Data, "base64");
    const parsedData = await simpleParser(buffer);
    return res.status(200).json({
      attachments: parsedData.attachments,
      subject: subject.value,
      html: parsedData.headerLines[0].line,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Failed to fetch and parse draft" });
  }
});

export default router;
