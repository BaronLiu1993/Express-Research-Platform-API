import { Worker } from "bullmq";
import { generateDraftFromSnippetEmail } from "../../services/emailServices.js";
import { Connection } from "../../redis/redis.js";

export const draftWorker = new Worker(
  "generate-draft",
  async (job) => {
    const { userId, professorId, body, accessToken } = job.data;
    console.log(`[Worker] Starting job ${job.id} - Queue: generate-draft - User: ${userId}`);
    try {
      const result = await generateDraftFromSnippetEmail({
        userId,
        professorId,
        body,
        accessToken,
      });
      return result;
    } catch (err) {
      console.error(`[Worker] Processor error in job ${job.id}:`, err.message);
      throw err;
    }
  },
  {
    connection: Connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

draftWorker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

draftWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`, err.message);
});

draftWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

draftWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});