// workers/followUpWorker.js
import { Worker } from "bullmq";
import { Connection } from "../redis/redis.js";
import { generateFollowUpDraftSnippetEmail } from "./queueService.js";

export const followUpWorker = new Worker(
  "follow-up-draft-email",
  async (job) => {
    const { userId, professorId, body, accessToken } = job.data;
    try {
      await generateFollowUpDraftSnippetEmail({
        userId,
        professorId,
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

followUpWorker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed for professor ${job.data.professorId}`);
});

followUpWorker.on("failed", (job, err) => {
  console.error(
    `Job ${job.id} failed for professor ${job.data.professorId}:`,
    err.message
  );
});

followUpWorker.on("stalled", (job, err) => {
  console.warn(`Job ${job.id} stalled`);
});

followUpWorker.on("error", (err) => {
  console.error("Worker error:", err);
});
