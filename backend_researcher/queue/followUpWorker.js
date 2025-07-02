// workers/followUpWorker.js
import { Worker } from "bullmq";
import { sendFollowUpEmail } from "./queueService.js";
import { Connection } from "../redis/redis.js";

export const followUpWorker = new Worker(
  "follow-up-email",
  async (job) => {
    const { userId, draftId, trackingId } = job.data;

    console.log(`🟡 [Worker] Starting job for userId=${userId}, draftId=${draftId}, trackingId=${trackingId}`);

    try {
      await sendFollowUpEmail({ userId, draftId, trackingId });
    } catch (err) {
      throw err; 
    }
  },
  {
    connection: Connection,
    concurrency: 5,
  }
);

// Optional: more detailed lifecycle logging
followUpWorker.on("completed", (job) => {
  console.log(`🎉 [Worker] Job completed for userId=${job.data.userId}, draftId=${job.data.draftId}`);
});

followUpWorker.on("failed", (job, err) => {
  console.error(`🔥 [Worker] Job failed for userId=${job.data.userId}, draftId=${job.data.draftId}`, err.message);
});

followUpWorker.on("active", (job) => {
  console.log(`🔄 [Worker] Job is active: trackingId=${job.data.trackingId}`);
});

followUpWorker.on("progress", (job, progress) => {
  console.log(`📈 [Worker] Job progress for trackingId=${job.data.trackingId}:`, progress);
});

followUpWorker.on("stalled", (jobId) => {
  console.warn(`⚠️ [Worker] Job stalled: jobId=${jobId}`);
});

followUpWorker.on("error", (err) => {
  console.error("💥 [Worker] Worker-level error:", err);
});
