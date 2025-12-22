import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { configureOAuth } from "../../services/googleServices.js";

dotenv.config();

async function refreshWatch({ userId }) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const gmail = await configureOAuth({ userId, supabase });

    const watchStatus = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: "projects/uoftresearch/topics/research-gmail-topic",
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
      },
    });


    const currentTime = new Date().toISOString();

    const { error: historyUpdateError } = await supabase
      .from("User_Profiles")
      .update({
        history_id: watchStatus.data.historyId,
        updated_watch: currentTime,
      })
      .eq("user_id", userId);

    if (historyUpdateError) {
      throw Error("Failed TO Update History Id");
    }
  } catch (err) {
    throw err;
  }
}

export const watchWorker = new Worker(
  "refresh-watch",
  async (job) => {
    const { userId } = job.data;
    console.log(
      `[Worker] Starting job ${job.id} - Queue: Watch Refresh - User: ${userId}`
    );
    try {
      await refreshWatch({ userId });
      console.log("Completed Job");
    } catch (err) {
      console.error(`[Worker] Processor error in job ${job.id}:`, err.message);
      throw err;
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

watchWorker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

watchWorker.on("failed", (job, err) => {
  console.error(
    `[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`,
    err.message
  );
});

watchWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

watchWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});
