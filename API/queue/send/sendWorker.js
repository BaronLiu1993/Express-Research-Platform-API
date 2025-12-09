import { Worker } from "bullmq";
import { sendSnippetEmail } from "../../services/emailServices.js";
import { Connection } from "../../redis/redis.js";

export const sendWorker = new Worker(
  "send-email",
  async (job) => {
    const { userId, userEmail, userName, body, accessToken, labelId } = job.data;
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

sendWorker.on("completed", (job, result) => {
  // Add Telemetry Here
});

sendWorker.on("failed", (job, err) => {
  // Add Telemetry Here
});

sendWorker.on("stalled", (job) => {
  // Add Telemetry Here
});

sendWorker.on("error", (err) => {
  // Add Telemetry Here
});
