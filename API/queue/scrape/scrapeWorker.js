import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { runScrapeJob } from "../../services/scraperServices.js";

export const scrapeWorker = new Worker(
  "scrape-professors",
  async (job) => {
    const { school, faculty, department, url } = job.data;
    console.log(`[ScrapeWorker] Starting job ${job.id} - ${school} / ${department}`);
    try {
      const result = await runScrapeJob({ school, faculty, department, url });
      console.log(
        `[ScrapeWorker] Job ${job.id} done — scraped: ${result.scraped}, inserted: ${result.inserted}, skipped: ${result.skipped}`
      );
      return result;
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.error(`[ScrapeWorker] Job ${job.id} failed:`, err.message);
      }
      throw err;
    }
  },
  {
    connection: Connection,
    concurrency: 2,
    limiter: {
      max: 3,
      duration: 60000,
    },
  }
);

scrapeWorker.on("completed", (job, result) => {
  console.log(`[ScrapeWorker] Job ${job.id} completed`);
});

scrapeWorker.on("failed", (job, err) => {
  console.error(`[ScrapeWorker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`, err.message);
});

scrapeWorker.on("stalled", (jobId) => {
  console.warn(`[ScrapeWorker] Job ${jobId} stalled`);
});

scrapeWorker.on("error", (err) => {
  console.error(`[ScrapeWorker] Internal error:`, err);
});
