import express from "express";
import draftQueue from "../../queue/draft/draftQueue.js";
import sendQueue from "../../queue/send/sendQueue.js";
import { verifyToken } from "../../services/authServices.js";

const router = express.Router();


router.post("/create-draft", verifyToken, async (req, res) => {
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