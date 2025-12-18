import { Worker } from "bullmq";
import { sendSnippetEmail } from "../../services/emailServices.js";
import { Connection } from "../../redis/redis.js";

export const sendWorker = new Worker(
  "send-email",
  async (job) => {
    const { userId, userEmail, userName, body, accessToken, labelId } = job.data;
    console.log(`[Worker] Processing job ${job.id} for user: ${userEmail}`);
    try {
      const result = await sendSnippetEmail({
        userId,
        userEmail,
        userName,
        body,
        accessToken,
        labelId
      });
      return result;
    } catch (err) {
      console.error(`[Worker] Error in job ${job.id} processor:`, err.message);
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

sendWorker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed. Result:`, result?.status || "Success");
});

sendWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed after ${job?.attemptsMade} attempts. Reason: ${err.message}`);
  
  if (job?.attemptsMade >= (job?.opts?.attempts || 1)) {
    console.error(`[Worker] Critical: Job ${job?.id} has exhausted all retries.`);
  }
});

sendWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} has stalled. It will be re-processed.`);
});

sendWorker.on("error", (err) => {
  console.error(`[Worker] Internal Worker Error:`, err);
});