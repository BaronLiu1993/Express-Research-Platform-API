import { Worker } from "bullmq";
import { sendSnippetEmail } from "./queueService.js";
import { Connection } from "../redis/redis.js";

export const sendWorker = new Worker(
    'send-email',
    async (job) => {
      const { userId, userEmail, userName, body } = job.data;
      console.log(userName)
      try {
        const result = await sendSnippetEmail({ userId, userEmail, userName, body });
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
  
  sendWorker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} sent professor`);
  });
  
  sendWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} sent failed for professor`, err.message);
  });
  
  sendWorker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} sent stalled`);
  });
  
  sendWorker.on('error', (err) => {
    console.error('Worker error:', err);
  });

