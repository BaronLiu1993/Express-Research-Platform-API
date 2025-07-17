import draftQueue from "../../queue/draftQueue";
import sendQueue from "../../queue/sendQueue";
import { createFollowUpEmail } from "../../queue/queueService";
import express from "express";

const router = express.Router();

router.post("/gmail/snippet-create-draft", async (req, res) => {
  const { userId, professorData, baseBody } = req.body;
  console.log(professorData);
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
    const addedJobs = await draftQueue.addBulk(jobs);
    console.log(jobs);
    console.log(jobs[0].data);
    console.log(jobs[0].data.body.dynamicFields);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

app.post("/gmail/mass-send", async (req, res) => {
  const { userId, userEmail, userName, professorData } = req.body;
  //Array of professorIdArray
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
    console.log(jobs);
    console.log(jobs[0]);
    const addedJobs = await sendQueue.addBulk(jobs);
    res.status(202).json({ message: "Bulk emails queued", count: jobs.length });
  } catch {
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

//Create Follow Up
router.post("/gmail/queue-follow-ups", async (req, res) => {
  const {
    userId,
    professorData, // [{ professorId, professorEmail, threadId, dynamicFields }]
    fromName,
    fromEmail,
    snippetSubject,
    snippetBody,
    delayMs,
  } = req.body;

  try {
    for (let i = 0; i < professorData.length; i++) {
      const { professorId, professorEmail, threadId, dynamicFields } =
        professorData[i];

      await createFollowUpEmail({
        userId,
        professorId,
        threadId,
        to: professorEmail,
        fromName,
        fromEmail,
        snippetSubject,
        snippetBody,
        dynamicFields,
        delayMs,
      });
    }

    return res.status(201).json({ message: "Queued Successfully" });
  } catch (err) {
    console.error("❌ Failed to queue follow-up:", err);
    return res
      .status(500)
      .json({ message: "Queueing failed", error: err.message });
  }
});
export default router;
