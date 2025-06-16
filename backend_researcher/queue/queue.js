import { Connection } from "../redis/redis.js";
import { Queue } from "bullmq";

const emailQueue = new Queue('email-queue', {
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
  });

  export default emailQueue