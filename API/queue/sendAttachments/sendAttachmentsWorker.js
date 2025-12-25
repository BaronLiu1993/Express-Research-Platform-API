import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { sendSnippetEmailWithAttachments } from "../../services/emailServices.js";

export const sendAttachmentsWorker = new Worker(
  "send-attachments-email",
  async (job) => {
    const { userId, userEmail, userName, body, accessToken, labelId, sendResume, sendTranscript } = job.data;
    console.log(`[Worker] Starting job ${job.id} - Queue: send-attachments-email - User: ${userEmail}`);
 
    try {
      const result = await sendSnippetEmailWithAttachments({
        userId,
        userEmail,
        userName,
        body,
        accessToken,
        labelId,
        sendResume,
        sendTranscript
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

sendAttachmentsWorker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

sendAttachmentsWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`, err.message);
});

sendAttachmentsWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

sendAttachmentsWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});