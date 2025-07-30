import { Connection } from "../redis/redis.js";
import { Queue } from "bullmq";

const sendWithAttachmentsQueue = new Queue('send-email-with-attachments', {
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

  export default sendWithAttachmentsQueue