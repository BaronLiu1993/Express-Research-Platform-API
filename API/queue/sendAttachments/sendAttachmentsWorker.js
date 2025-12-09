import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { sendSnippetEmailWithAttachments } from "../../services/emailServices.js";

export const sendAttachmentsWorker = new Worker(
  "send-attachments-email",
  async (job) => {
    const { userId, userEmail, userName, body, accessToken, labelId } = job.data;
    try {
      const result = await sendSnippetEmailWithAttachments({
        userId,
        userEmail,
        userName,
        body,
        accessToken,
        labelId
      });
      return result;
    } catch (err) {
      // Add Telemetry Here
      throw new Error("Failed To Send");
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
  // Add Telemetry Here
});

sendAttachmentsWorker.on("failed", (job, err) => {
  // Add Telemetry Here
});

sendAttachmentsWorker.on("stalled", (job) => {
  // Add Telemetry Here
});

sendAttachmentsWorker.on("error", (err) => {
  // Add Telemetry Here
});
