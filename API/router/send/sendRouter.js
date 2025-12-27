import express from "express";
import draftQueue from "../../queue/draft/draftQueue.js";
import sendQueue from "../../queue/send/sendQueue.js";
import variablelessDraftQueue from "../../queue/variablelessDrafts/variablelessQueue.js";
import sendAttachmentsQueue from "../../queue/sendAttachments/sendAttachmentsQueue.js";
import { verifyToken } from "../../services/authServices.js";
import { configureOAuth, makeBody } from "../../services/googleServices.js";
import { simpleParser } from "mailparser";

const router = express.Router();

router.post("/create-draft", verifyToken, async (req, res) => {
  const { professorData, baseBody } = req.body;

  if (professorData.length > 5) {
    res.status(400).json({ message: "Queueing Too Many" });
  }

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

router.post("/create-variableless-draft", verifyToken, async (req, res) => {
  const { html, subject, baseBody, professorData } = req.body;
  if (professorData.length > 5) {
    res.status(400).json({ message: "Queueing Too Many" });
  }

  const userId = req.user.sub;
  try {
    const jobs = professorData.map((professor) => ({
      name: "generate-variableless-draft",
      data: {
        userId,
        professorId: professor.id,
        accessToken: req.token,
        body: {
          ...baseBody,
          html: html,
          subject: subject,
          to: professor.email,
          toName: professor.name,
        },
      },
    }));
    await variablelessDraftQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/send-draft", verifyToken, async (req, res) => {
  const { userEmail, userName, professorData, labelId } = req.body;
  
  if (professorData.length > 5) {
    res.status(400).json({ message: "Queueing Too Many Emails" });
  }
  const userId = req.user.sub;
  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email",
      data: {
        userId,
        userEmail,
        userName,
        accessToken: req.token,
        labelId,
        body: {
          professorId: professor.professor_id,
          professorEmail: professor.email,
          professorName: professor.name,
          id: professor.id,
        },
      },
    }));
    await sendQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/send-attachments-draft", verifyToken, async (req, res) => {
  const {
    userEmail,
    userName,
    professorData,
    labelId,
    sendResume,
    sendTranscript,
  } = req.body;
  if (professorData.length > 5) {
    res.status(400).json({ message: "Queueing Too Many Emails" });
  }

  console.log(sendResume)
  console.log(sendTranscript)

  if (
    !userEmail ||
    !userName ||
    !professorData ||
    !labelId ||
    typeof sendResume !== "boolean" ||
    typeof sendTranscript !== "boolean"
  ) {
    return res.status(400).json({
      message: "Missing or invalid required fields",
    });
  }

  const userId = req.user.sub;
  try {
    const jobs = professorData.map((professor) => ({
      name: "send-attachments-email",
      data: {
        userId,
        userEmail,
        userName,
        accessToken: req.token,
        labelId,
        sendResume,
        sendTranscript,
        body: {
          professorId: professor.professor_id,
          professorEmail: professor.email,
          professorName: professor.name,
          id: professor.id,
        },
      },
    }));
    await sendAttachmentsQueue.addBulk(jobs);
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
    if (draftError) {
      return res.status(400).json({ message: "Failed To Fetch Drafts" });
    }

    return res.status(200).json({ data: draftsData });
  } catch (err) {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.get("/get-singular-draft", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { draftId } = req.query;

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
    return res.status(500).json({ message: "Failed to fetch and parse draft" });
  }
});

router.put("/update-draft", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const { draftId } = req.query;
  const { to, fromEmail, fromName, subject, body } = req.body;
  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });
    const raw = await makeBody({
      to,
      from: fromEmail,
      name: fromName,
      subject,
      html: body,
    });
    await gmail.users.drafts.update({
      userId: "me",
      id: draftId,
      requestBody: { message: { raw } },
    });

    return res
      .status(200)
      .json({ updated: true, message: "Successfully Completed" });
  } catch {
    return res
      .status(500)
      .json({ updated: false, message: "Internal Server Error" });
  }
});

router.delete("/delete-draft", verifyToken, async (req, res) => {
  const { draftId } = req.query;
  const userId = req.user.sub;
  try {
    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    await gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    });

    const { error: draftDeleteError } = await req.supabaseClient
      .from("Emails")
      .delete()
      .eq("draft_id", draftId);

    if (draftDeleteError) {
      return res.status(400).json({ message: "Failed To Delete" });
    }

    return res.status(200).json({ message: "Deleted Successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Errors" });
  }
});

export default router;
