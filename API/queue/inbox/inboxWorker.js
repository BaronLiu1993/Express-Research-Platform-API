import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { supabase } from "../../supabase/supabase.js";
import { configureOAuth } from "../../services/googleServices.js";

async function updateInbox({ historyId, email }) {
  try {
    console.log(`[InboxWorker] Starting update for email: ${email}`);

    const { data: userDataId, error: userDataFetchError } = await supabase
      .from("User_Profiles")
      .select("user_id")
      .eq("student_email", email)
      .single();

    if (userDataFetchError || !userDataId) {
      throw new Error(
        `Failed to fetch user profile for ${email}: ${userDataFetchError?.message}`
      );
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

    if (historyIdFetchError || !historyIdData) {
      throw new Error(
        `Failed to fetch history_id for user ${userDataId.user_id}: ${historyIdFetchError?.message}`
      );
    }

    const result = await gmail.users.history.list({
      userId: "me",
      startHistoryId: historyIdData.history_id,
    });

    const threadIdSet = new Set<string>();

    if (result.data.history) {
      for (const msg of result.data.history) {
        const threadId = msg.messages?.[0]?.threadId;
        if (threadId) threadIdSet.add(threadId);
      }
    }

    console.log(
      `[InboxWorker] Found ${threadIdSet.size} unique threads to process for ${email}`
    );

    for (const threadId of threadIdSet) {
      const { data, error } = await supabase.rpc("tracked_thread_exists", {
        p_user_id: userDataId.user_id,
        p_thread_id: threadId,
      });

      if (error) {
        throw new Error(
          `RPC tracked_thread_exists failed for thread ${threadId}: ${error.message}`
        );
      }

      if (data === true) {
        const lastUpdatedAt = new Date().toISOString();

        const { error: updateError } = await supabase
          .from("Messages")
          .update({
            sent_at: lastUpdatedAt,
            unread: true,
          })
          .eq("thread_id", threadId)
          .eq("type", "first");

        if (updateError) {
          throw new Error(
            `Failed to update Messages for thread ${threadId}: ${updateError.message}`
          );
        }
      }
    }

    const { error: historyUpdateError } = await supabase
      .from("User_Profiles")
      .update({ history_id: historyId })
      .eq("user_id", userDataId.user_id);

    if (historyUpdateError) {
      throw new Error(
        `Failed to update final history_id for user ${userDataId.user_id}: ${historyUpdateError.message}`
      );
    }

    console.log(`[InboxWorker] Successfully updated inbox for ${email}`);
  } catch (err) {
    console.error(`[InboxWorker] Unhandled exception`, err);
    throw err; 
  }
}


export const inboxWorker = new Worker(
  "inbox-sync",
  async (job) => {
    const { historyId, email } = job.data;
    console.log(
      `[Worker] Starting job ${job.id} - Queue: inbox-sync - Email: ${email}`
    );
    try {
      await updateInbox({
        historyId,
        email,
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
  console.error(
    `[Worker] Job ${job?.id} failed - Attempt ${job?.attemptsMade}:`,
    err.message
  );
});

inboxWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled and will be retried`);
});

inboxWorker.on("error", (err) => {
  console.error(`[Worker] Internal worker error:`, err);
});
