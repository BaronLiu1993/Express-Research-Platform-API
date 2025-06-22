import { Worker } from "bullmq";
import { sendSnippetEmail } from "./sendSnippet.js";
import { generateDraftFromSnippetEmail } from "./sendSnippet.js";
import { Connection } from "../redis/redis.js";

export const emailWorker = new Worker(
    'generate-draft',
    async (job) => {
      const { userId, professorId, body } = job.data;
      try {
        console.log(`Processing email job ${job.id} for professor ${professorId}`);
        
        // Call your existing sendSnippetEmail function with correct parameters
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
  emailWorker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed for professor ${job.data.professorId}`);
  });
  
  emailWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed for professor ${job.data.professorId}:`, err.message);
  });
  
  emailWorker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
  });
  
  emailWorker.on('error', (err) => {
    console.error('Worker error:', err);
  });

export const draftWorker = new Worker(
    'send-email',
    async (job) => {
      const { userId, professorId, body } = job.data;
      try {
        console.log(`Processing email job ${job.id} for professor ${professorId}`);
        
        // Call your existing sendSnippetEmail function with correct parameters
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
  emailWorker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed for professor ${job.data.professorId}`);
  });
  
  emailWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed for professor ${job.data.professorId}:`, err.message);
  });
  
  emailWorker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
  });
  
  emailWorker.on('error', (err) => {
    console.error('Worker error:', err);
  });