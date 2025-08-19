import { Worker } from "bullmq";
import { generateDraftFromSnippetEmail } from "./queueService.js";
import { Connection } from "../redis/redis.js";

export const draftWorker = new Worker(
    'generate-draft',
    async (job) => {
      const { userId, professorId, body } = job.data;
      try {
        
        const result = await generateDraftFromSnippetEmail({ userId, professorId, body });
        
        console.log(`Email Created Sucessfully for professor ${professorId}`);
        return result;
      } catch (error) {
        console.error(`Failed to send email for job ${job.id}:`, error);
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
  
  // Worker event handlers for monitoring
  draftWorker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed for professor ${job.data.professorId}`);
  });
  
  draftWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed for professor ${job.data.professorId}:`, err.message);
  });
  
  draftWorker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
  });
  
  draftWorker.on('error', (err) => {
    console.error('Worker error:', err);
  });