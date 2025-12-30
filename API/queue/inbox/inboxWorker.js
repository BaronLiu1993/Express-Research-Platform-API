import { Worker } from "bullmq";
import { Connection } from "../../redis/redis.js";
import { configureOAuth } from "../../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";

const supabaseServerSide = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function updateInbox({ historyId, email }) {
  try {
    console.log(`[InboxWorker] Starting update for email: ${email}`);

    const { data: userDataId, error: userDataFetchError } = await supabaseServerSide
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
      supabase: supabase,
    });

    const { data: historyIdData, error: historyIdFetchError } = await supabaseServerSide
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
      startHistoryId: historyId,
      historyTypes: ["messageAdded", "labelAdded"],
      maxResults: 500,
    });

    const threadIdSet = new Set();

    if (result.data.history) {
      for (const msg of result.data.history) {
        const threadId = msg.messages?.[0]?.threadId;
        if (threadId) threadIdSet.add(threadId);
      }
    }

    console.log(
      `[InboxWorker] Found ${threadIdSet.size} unique threads to process for ${email}`
    );

    let i = 0;

    for (const threadId of threadIdSet) {
      i++;

      console.log(
        `\n[InboxWorker] (#${i}/${threadIdSet.size}) Processing threadId=${threadId} user=${userDataId.user_id}`
      );

      const rpcStarted = Date.now();
      const { data: rpcData, error: rpcError } = await supabaseServerSide.rpc(
        "tracked_thread_exists",
        {
          p_user_id: userDataId.user_id,
          p_thread_id: threadId,
        }
      );
      console.log(
        `[InboxWorker] RPC tracked_thread_exists finished in ${Date.now() - rpcStarted}ms`
      );

      if (rpcError) {
        console.error(
          `[InboxWorker] RPC ERROR threadId=${threadId}:`,
          rpcError
        );
        throw new Error(
          `RPC tracked_thread_exists failed for thread ${threadId}: ${rpcError.message}`
        );
      }

      console.log(
        `[InboxWorker] RPC RESULT threadId=${threadId}:`,
        rpcData,
        `(type=${typeof rpcData})`
      );

      const exists =
        rpcData === true ||
        rpcData === "true" ||
        rpcData === "t" ||
        rpcData === 1 ||
        rpcData?.exists === true ||
        rpcData?.tracked_thread_exists === true;

      if (!exists) {
        console.log(
          `[InboxWorker] SKIP threadId=${threadId} because exists=false (raw=${JSON.stringify(
            rpcData
          )})`
        );
        continue;
      }

      const lastUpdatedAt = new Date().toISOString();
      console.log(
        `[InboxWorker] Updating Messages for threadId=${threadId} lastUpdatedAt=${lastUpdatedAt}`
      );

      const updateStarted = Date.now();
      const { data: updatedRows, error: updateError } = await supabaseServerSide
        .from("Messages")
        .update({
          sent_at: lastUpdatedAt,
          unread: true,
        })
        .eq("thread_id", threadId)
        .eq("type", "first")
        .select("id, thread_id, type, sent_at, unread"); 

      console.log(
        `[InboxWorker] Messages.update finished in ${Date.now() - updateStarted}ms`
      );

      if (updateError) {
        console.error(
          `[InboxWorker] UPDATE ERROR threadId=${threadId}:`,
          updateError
        );
        throw new Error(
          `Failed to update Messages for thread ${threadId}: ${updateError.message}`
        );
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.warn(
          `[InboxWorker] UPDATE MATCHED 0 ROWS threadId=${threadId}. Likely your WHERE clause doesn't match. ` +
            `Check Messages.thread_id and Messages.type ("first").`
        );
      } else {
        console.log(
          `[InboxWorker] UPDATED ${updatedRows.length} ROW(S) threadId=${threadId}:`,
          updatedRows
        );
      }
    }

    console.log(`[InboxWorker] Done processing ${threadIdSet.size} threads.`);

    const { error: historyUpdateError } = await supabaseServerSide
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
