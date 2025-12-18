import { configureOAuth } from "../../services/googleServices";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export async function refreshWatch({ accessToken, userId }) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    const gmail = await configureOAuth({ userId, supabase });

    const watchStatus = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: "projects/uoftresearch/topics/research-gmail-topic",
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
      },
    });

    const { error: historyUpdateError } = await req.supabaseClient
      .from("User_Profiles")
      .update({ history_id: watchStatus.data.historyId })
      .eq("user_id", userId);

    if (historyUpdateError) {
      throw Error("Failed TO Update HistoryId");
    }
  } catch (err) {
    throw err;
  }
}
