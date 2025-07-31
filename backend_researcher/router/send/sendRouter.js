import draftQueue from "../../queue/draftQueue.js";
import sendQueue from "../../queue/sendQueue.js";
import sendWithAttachmentsQueue from "../../queue/sendWithAttachmentsQueue.js";
import followUpDraftQueue from "../../queue/followUpDraftQueue.js";
import express from "express";
import followUpQueue from "../../queue/followUpQueue.js";

const router = express.Router();

router.post("/snippet-create-followup-draft", async (req, res) => {
  const { userId, professorData, baseBody } = req.body;
  try {
    const jobs = professorData.map((professor) => ({
      name: "follow-up-draft-email",
      data: {
        userId,
        professorId: professor.id,
        body: {
          ...baseBody,
          dynamicFields: professor.dynamicFields,
          to: professor.email,
        },
      },
    }));
    await followUpDraftQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/mass-send-followup-with-attachments", async (req, res) => {
  const { userId, userEmail, userName, professorData } = req.body;
  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email-with-attachments",
      data: {
        userId,
        userEmail,
        userName,
        body: {
          professorId: professor.id,
          professorEmail: professor.email,
          professorName: professor.name,
        },
      },
    }));
    await followUpQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/mass-send-followup", async (req, res) => {
  const { userId, userEmail, userName, professorData } = req.body;
  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email",
      data: {
        userId,
        userEmail,
        userName,
        body: {
          professorId: professor.professor_id,
          professorEmail: professor.email,
          professorName: professor.name,
        },
      },
    }));
    await followUpQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

//Normal First Email

router.post("/snippet-create-draft", async (req, res) => {
  const { userId, professorData, baseBody } = req.body;
  try {
    const jobs = professorData.map((professor) => ({
      name: "generate-draft",
      data: {
        userId,
        professorId: professor.id,
        body: {
          ...baseBody,
          dynamicFields: professor.dynamicFields,
          to: professor.email,
        },
      },
    }));
    await draftQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/mass-send-with-attachments", async (req, res) => {
  const { userId, userEmail, userName, professorData } = req.body;
  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email-with-attachments",
      data: {
        userId,
        userEmail,
        userName,
        body: {
          professorId: professor.id,
          professorEmail: professor.email,
          professorName: professor.name,
        },
      },
    }));
    await sendWithAttachmentsQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/mass-send", async (req, res) => {
  const { userId, userEmail, userName, professorData } = req.body;
  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email",
      data: {
        userId,
        userEmail,
        userName,
        body: {
          professorId: professor.id,
          professorEmail: professor.email,
          professorName: professor.name,
        },
      },
    }));
    await sendQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

export default router;
