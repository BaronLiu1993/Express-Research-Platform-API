import { Worker } from "bullmq";
import { generateDraftEmail } from "../../services/emailServices.js";
import { Connection } from "../../redis/redis.js";

export const draftWorker = new Worker(
  "generate-variableless-draft",
  async (job) => {
    const { userId, professorId, body, accessToken } = job.data;
    try {
      const result = await generateDraftEmail({
        userId,
        professorId,
        body,
        accessToken,
      });
      return result;
    } catch (err) {
      throw new Error("Failed");
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
  // Add Telemetry Here
});

draftWorker.on("failed", (job, err) => {
  // Add Telemetry Here
});

draftWorker.on("stalled", (job, err) => {
  // Add Telemetry Here
});

draftWorker.on("error", (err) => {
  // Add Telemetry Here
});
