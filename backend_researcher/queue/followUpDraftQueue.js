import { Connection } from "../redis/redis.js";
import { Queue } from "bullmq";

const followUpDraftQueue = new Queue('follow-up-draft-email', {
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

  export default followUpDraftQueue