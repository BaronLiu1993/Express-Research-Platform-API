import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { supabase } from "../../supabase/supabase.js";
import { configureOAuth } from "../../services/googleServices.js";

async function updateInbox({ historyId, email, res }) {
  try {
    console.log(`[InboxWorker] Starting update for email: ${email}`);
    const { data: userDataId, error: userDataFetchError } = await supabase
      .from("User_Profiles")
      .select("user_id")
      .eq("student_email", email)
      .single();

    if (userDataFetchError) {
      console.error(`[InboxWorker] Error fetching user profile: ${userDataFetchError.message}`);
      return res?.status(400).json({ message: "internal server error" });
    }

    const gmail = await configureOAuth({
      userId: userDataId.user_id,
      supabase,
    });

    const { data: historyIdData, error: historyIdFetchError } = await supabase
      .from("User_Profiles")
      .select("history_id")
      .eq("user_id", userDataId.user_id)
      .single();

    if (historyIdFetchError) {
      console.error(`[InboxWorker] Error fetching history_id: ${historyIdFetchError.message}`);
      return res?.status(400).json({ message: "internal server error" });
    }

    const result = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyIdData.history_id,
    });

    const threadIdSet = new Set();
    if (result.data.history) {
      for (const msg of result.data.history) {
        const threadId = msg.messages[0].threadId;
        threadIdSet.add(threadId);
      }
    }

    console.log(`[InboxWorker] Found ${threadIdSet.size} unique threads to process for ${email}`);

    for (const threadId of threadIdSet) {
      if (threadId) {
        const { data, error } = await supabase.rpc("tracked_thread_exists", {
          p_user_id: userDataId.user_id,
          p_thread_id: threadId,
        });

        if (error) {
          console.error(`[InboxWorker] RPC Error for thread ${threadId}: ${error.message}`);
          return res?.status(400).json({ message: "internal server error" });
        }

        if (data === true) {
          const lastUpdatedAt = new Date().toISOString();
          const { error: upsertError } = await supabase
            .from("Messages")
            .update({
              sent_at: lastUpdatedAt,
              unread: true,
            })
            .eq("thread_id", threadId)
            .eq("type", "first");
          
          if (upsertError) {
            console.error(`[InboxWorker] Error updating Message ${threadId}: ${upsertError.message}`);
            return res?.status(400).json({ message: "internal server error" });
          }
        }
      }
    }

    const { error: historyUpdateError } = await supabase
      .from("User_Profiles")
      .update({ history_id: historyId })
      .eq("user_id", userDataId.user_id);

    if (historyUpdateError) {
      console.error(`[InboxWorker] Error updating final history_id: ${historyUpdateError.message}`);
      return res?.status(400).json({ message: "internal server error" });
    }
  } catch (err) {
    console.error(`[InboxWorker] Unhandled exception:`, err);
    return res?.status(500).json({ message: "internal server error" });
  }
}

export const inboxWorker = new Worker(
  "inbox-sync",
  async (job) => {
    const { historyId, email, res } = job.data;
    console.log(`[Worker] Starting job ${job.id} - Queue: inbox-sync - Email: ${email}`);
    try {
      await updateInbox({
        historyId,
        email,
        res,
      });
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

inboxWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

inboxWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`, err.message);
});

inboxWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

inboxWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});