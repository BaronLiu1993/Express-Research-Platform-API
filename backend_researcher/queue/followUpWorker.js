// workers/followUpWorker.js
import { Worker } from "bullmq";
import { sendFollowUpEmail } from "./queueService.js";
import { Connection } from "../redis/redis.js";

export const followUpWorker = new Worker(
  "follow-up-email",
  async (job) => {
    const { userId, userEmail, userName, body } = job.data;
    try {
      await sendFollowUpEmail({ userId, userEmail, userName, body });
    } catch (err) {
      throw err;
    }
  },
  {
    connection: Connection,
    concurrency: 5,
  }
);

followUpWorker.on("completed", (job) => {
  console.log(
    `[Worker] Job completed for userId=${job.data.userId}, draftId=${job.data.draftId}`
  );
});

followUpWorker.on("failed", (job, err) => {
  console.error(
    `🔥 [Worker] Job failed for userId=${job.data.userId}, draftId=${job.data.draftId}`,
    err.message
  );
});

followUpWorker.on("active", (job) => {
  console.log(`[Worker] Job is active`);
});

followUpWorker.on("progress", (job, progress) => {
  console.log(
    `[Worker] Job progress:`,
    progress
  );
});

followUpWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job stalled: jobId=${jobId}`);
});

followUpWorker.on("error", (err) => {
  console.error("[Worker] Worker-level error:", err);
});
