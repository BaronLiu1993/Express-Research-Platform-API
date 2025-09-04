// workers/followUpWorker.js
import { Worker } from "bullmq";
import { Connection } from "../redis/redis.js";
import { generateFollowUpDraftSnippetEmail } from "./queueService.js";

export const followUpWorker = new Worker(
  "follow-up-draft-email",
  async (job) => {
    const { userId, professorId, body, accessToken, threadId } = job.data;
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
  console.log(`[Worker] Job progress`, progress);
});

followUpWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job stalled: jobId=${jobId}`);
});

followUpWorker.on("error", (err) => {
  console.error("[Worker] Worker-level error:", err);
});
