import dotenv from "dotenv";

import { createClient } from "@supabase/supabase-js";

dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function generateUploadPresignedURL({
  userId,
  fileName,
  fileType,
}) {
  try {
    if (!userId || !fileName || !fileType) {
      throw new Error("Missing required parameters");
    }

    const filePath = `${userId}/${fileType}/${fileName}.pdf`;

    const { data, error } = await supabase.storage
      .from("userfiles")
      .createSignedUploadUrl(filePath, {
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase Storage error`);
    }

    return data;
  } catch (err) {
    throw new Error(`Internal Server Error: ${err.message}`);
  }
}

export async function generateGetPresignedURL({ userId, fileType, fileName }) {
  try {
    if (!userId || !fileType || !fileName) {
      throw new Error("Missing Parameters");
    }

    const { data, error } = await supabase.storage
      .from("userfiles")
      .createSignedUrl(`${userId}/${fileType}/${fileName}.pdf`, 60);

    if (error) {
      throw new Error("Failed to Generate URL for File");
    }
    return data;
  } catch {
    throw new Error("Internal Server Error");
  }
}
