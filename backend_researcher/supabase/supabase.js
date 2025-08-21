import dotenv from "dotenv";
import { createServer}
import { createClient } from "@supabase/supabase-js";

dotenv.config();

//This is for logging in and registration only

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
