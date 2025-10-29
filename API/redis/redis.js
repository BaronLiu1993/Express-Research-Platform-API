import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const Connection = new IORedis(
  process.env.REDIS_URL || {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  {
    maxRetriesPerRequest: null,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    lazyConnect: true,
  }
);
