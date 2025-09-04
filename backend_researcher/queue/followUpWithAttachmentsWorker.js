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
    } catch {
      throw new Error("Internal Server Error");
    }
  },
  {
    connection: Connection,
    concurrency: 5,
  }
);

followUpWorkerWithAttachments.on("completed", (job) => {
  console.log(
    `[Worker] Job completed for userId=${job.data.userId}, draftId=${job.data.draftId}`
  );
});

followUpWorkerWithAttachments.on("failed", (job, err) => {
  console.error(
    `🔥 [Worker] Job failed for userId=${job.data.userId}, draftId=${job.data.draftId}`,
    err.message
  );
});

followUpWorkerWithAttachments.on("active", (job) => {
  console.log(`[Worker] Job is active`);
});

followUpWorkerWithAttachments.on("progress", (job, progress) => {
  console.log(`[Worker] Job progress`, progress);
});

followUpWorkerWithAttachments.on("stalled", (jobId) => {
  console.warn(`[Worker] Job stalled: jobId=${jobId}`);
});

followUpWorkerWithAttachments.on("error", (err) => {
  console.error("[Worker] Worker-level error:", err);
});
