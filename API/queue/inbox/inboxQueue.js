import { Connection } from "../../redis/redis.js";
import { Queue } from "bullmq";
import { BullMQOtel } from "bullmq-otel";

const inboxQueue = new Queue('inbox-sync', {
    connection: Connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
    telemetry: new BullMQOtel("inbox-telemetry")
  });

  export default inboxQueue