import { Worker } from "bullmq";
import { generateDraftEmail } from "../../services/emailServices.js";
import { Connection } from "../../redis/redis.js";

export const draftVariablelessWorker = new Worker(
  "generate-variableless-draft",
  async (job) => {
    const { userId, professorId, body, accessToken } = job.data;
    console.log(`[Worker] Starting job ${job.id} - Queue: generate-variableless-draft - User: ${userId}`);
    try {
      const result = await generateDraftEmail({
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

draftVariablelessWorker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

draftVariablelessWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`, err.message);
});

draftVariablelessWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

draftVariablelessWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});