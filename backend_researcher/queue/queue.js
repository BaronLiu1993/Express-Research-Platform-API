import { Queue } from "bullmq";

export const emailQueue = new Queue('emailqueue', {
    connection: {
        host: process.env.REDIS_URL,
        port: 6379
    }
});

