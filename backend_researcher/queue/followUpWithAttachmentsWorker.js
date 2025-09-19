// workers/followUpWorker.js
import { Worker } from "bullmq";
import { sendFollowUpWithAttachments } from "./queueService.js";
import { Connection } from "../redis/redis.js";

export const followUpWorkerWithAttachments = new Worker(
  "follow-up-email-with-attachments",
  async (job) => {
    const { userId, userEmail, userName, body, accessToken } = job.data;
    try {
      await sendFollowUpWithAttachments({
        userId,
        userEmail,
        userName,
        body,
        accessToken,
      });
    } catch (err) {
      throw err;
    }
  },
  {
    connection: Connection,
    concurrency: 5,
  }
);

followUpWorkerWithAttachments.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed`);
});

followUpWorkerWithAttachments.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed for professor`, err.message);
});

followUpWorkerWithAttachments.on("stalled", (job, err) => {
  console.warn(`Job ${job.id} stalled`);
});

followUpWorkerWithAttachments.on("error", (err) => {
  console.error("Worker error:", err);
});
