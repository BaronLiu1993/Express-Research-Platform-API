import express from "express";
import draftQueue from "../../queue/draft/draftQueue.js";
import sendQueue from "../../queue/send/sendQueue.js";
import variablelessDraftQueue from "../../queue/variablelessDrafts/variablelessQueue.js";
import sendAttachmentsQueue from "../../queue/sendAttachments/sendAttachmentsQueue.js";
import { verifyToken } from "../../services/authServices.js";
import { configureOAuth, makeBody } from "../../services/googleServices.js";
import { simpleParser } from "mailparser";
import {
  CreateDraftSchema,
  CreateVariablelessDraftSchema,
  SendDraftSchema,
  SendAttachmentsDraftSchema,
  DraftIdQuerySchema,
  UpdateDraftBodySchema,
} from "../../schema/sendSchema.js";

const router = express.Router();

router.post("/create-draft", verifyToken, async (req, res) => {
  const parsed = CreateDraftSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Queueing Too Many" });
  }
  const { professorData, baseBody } = parsed.data;

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
    console.log(err)
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/create-variableless-draft", verifyToken, async (req, res) => {
  const parsed = CreateVariablelessDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Queueing Too Many" });
  }
  const { html, subject, baseBody, professorData } = parsed.data;

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
  const parsed = SendDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Queueing Too Many Emails" });
  }
  const { userEmail, userName, professorData, labelId } = parsed.data;
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
  const parsed = SendAttachmentsDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Missing or invalid required fields",
    });
  }
  const { userEmail, userName, professorData, labelId, sendResume, sendTranscript } = parsed.data;

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
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  try {
    const { data: draftsData, error: draftError } = await req.supabaseClient
      .from("Emails")
      .select("*")
      .eq("user_id", userId)
      .range(from, to);
    if (draftError) {
      return res.status(400).json({ message: "Failed To Fetch Drafts" });
    }

    const has_more = draftsData.length > 50;
    return res.status(200).json({ data: draftsData, has_more, page });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch drafts" });
  }
});

router.get("/get-singular-draft", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const queryParsed = DraftIdQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ message: "Missing draft ID" });
  }
  const { draftId } = queryParsed.data;

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
  const queryParsed = DraftIdQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ updated: false, message: "Missing draft ID" });
  }
  const { draftId } = queryParsed.data;
  const bodyParsed = UpdateDraftBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ updated: false, message: "Invalid request body" });
  }
  const { to, fromEmail, fromName, subject, body } = bodyParsed.data;
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
  const queryParsed = DraftIdQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ message: "Missing draft ID" });
  }
  const { draftId } = queryParsed.data;
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
