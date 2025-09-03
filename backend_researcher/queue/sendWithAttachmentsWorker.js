import { Worker } from "bullmq";
import { sendSnippetEmailWithAttachments } from "./queueService.js";
import { Connection } from "../redis/redis.js";

export const sendWithAttachmentsWorker = new Worker(
  "send-email-with-attachments",
  async (job) => {
    const { userId, userEmail, userName, body, accessToken } = job.data;
    console.log(job.data)
    try {
      const result = await sendSnippetEmailWithAttachments({
        userId,
        userEmail,
        userName,
        body,
        accessToken
      });
      return result;
    } catch (error) {
      throw error;
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

sendWithAttachmentsWorker.on("completed", (job, result) => {
  console.log(`✅ Job ${job.id} sent professor`);
});

sendWithAttachmentsWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} sent failed for professor`, err.message);
});

sendWithAttachmentsWorker.on("stalled", (jobId) => {
  console.warn(`⚠️ Job ${jobId} sent stalled`);
});

sendWithAttachmentsWorker.on("error", (err) => {
  console.error("Worker error:", err);
});
