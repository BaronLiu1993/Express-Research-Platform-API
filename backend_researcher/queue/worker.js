import { Worker } from "bullmq";
import { sendEmail } from "./compose/compose";

const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    const { clientId, clientSecret, fromEmail, fromName, to, subject, text } = job.data;
    await sendEmail({ clientId, clientSecret, fromEmail, fromName, to, subject, text });
  },
  {
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
  }
);

emailWorker.on("completed", job => {
    console.log(`Sent to ${job.data.to}`)
})

emailWorker.on("failed", (job, err) => {
    console.log(`Sent to ${job.data.to}`, err.message)
})
