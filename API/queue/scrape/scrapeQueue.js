import { Queue } from "bullmq";
import { Connection } from "../../redis/redis.js";

const scrapeQueue = new Queue("scrape-professors", {
  connection: Connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export default scrapeQueue;
