import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { refreshWatch } from "./configureWatch.js";

export const watchWorker = new Worker(
  "refresh-watch",
  async (job) => {
    const { userId, accessToken } = job.data;
    console.log(
      `[Worker] Starting job ${job.id} - Queue: generate-variableless-draft - User: ${userId}`
    );
    try {
      await refreshWatch({ accessToken, userId });
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

watchWorker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

watchWorker.on("failed", (job, err) => {
  console.error(
    `[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`,
    err.message
  );
});

watchWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

watchWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});
