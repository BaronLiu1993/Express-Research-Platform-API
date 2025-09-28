import draftQueue from "../../queue/draftQueue.js";
import sendQueue from "../../queue/sendQueue.js";
import sendWithAttachmentsQueue from "../../queue/sendWithAttachmentsQueue.js";
import followUpDraftQueue from "../../queue/followUpDraftQueue.js";
import express from "express";
import followUpQueue from "../../queue/followUpQueue.js";
import followUpWithAttachmentsQueue from "../../queue/followUpWithAttachmentsQueue.js";
import { verifyToken } from "../../services/authServices.js";

const router = express.Router();

router.post("/snippet-create-followup-draft", verifyToken, async (req, res) => {
  const { professorData, baseBody } = req.body;
  const userId = req.user.sub;

  try {
    const jobs = professorData.map((professor) => ({
      name: "follow-up-draft-email",
      data: {
        userId,
        professorId: professor.id,
        accessToken: req.token,
        body: {
          ...baseBody,
          dynamicFields: professor.dynamicFields,
          to: professor.email,
        },
      },
    }));
    await followUpDraftQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post(
  "/mass-send-followup-with-attachments",
  verifyToken,
  async (req, res) => {
    const { userEmail, userName, professorData } = req.body;
    const userId = req.user.sub;
    try {
      const jobs = professorData.map((professor) => ({
        name: "follow-up-email-with-attachments",
        data: {
          userId,
          userEmail,
          userName,
          accessToken: req.token,
          body: {
            threadId: professor.thread_id,
            messageId: professor.message_id,
            professorId: professor.professor_id,
            professorEmail: professor.professor_email,
            professorName: professor.professor_name,
          },
        },
      }));
      await followUpWithAttachmentsQueue.addBulk(jobs);
      res
        .status(202)
        .json({ message: "Bulk emails queued", count: jobs.length });
    } catch {
      res.status(500).json({ message: "Failed to queue bulk emails" });
    }
  }
);

router.post("/mass-send-followup", verifyToken, async (req, res) => {
  const { userEmail, userName, professorData } = req.body;
  const userId = req.user.sub;

  try {
    const jobs = professorData.map((professor) => ({
      name: "follow-up-draft-email",
      data: {
        userId,
        userEmail,
        userName,
        accessToken: req.token,
        body: {
          professorId: professor.professor_id,
          professorEmail: professor.professor_email,
          professorName: professor.professor_name,
          messageId: professor.message_id,
          threadId: professor.thread_id,
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
//Add Professor Email Somehow tomorrow
router.post("/snippet-create-draft", verifyToken, async (req, res) => {
  const { professorData, baseBody } = req.body;
  const userId = req.user.sub;
  if (professorData.length > 10) {
    return res.status(400).json({ message: "Too Many Messages" });
  }

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
    console.log(jobs);
    await draftQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/mass-send-with-attachments", verifyToken, async (req, res) => {
  const { userEmail, userName, professorData } = req.body;
  console.log(professorData);
  const userId = req.user.sub;

  try {
    const jobs = professorData.map((professor) => ({
      name: "send-email-with-attachments",
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
    await sendWithAttachmentsQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

router.post("/mass-send", verifyToken, async (req, res) => {
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
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

export default router;
