import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
