import dotenv from "dotenv";

// Use Service Side Supabase just for this to bypass RLS once
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
      console.warn("[generateUploadPresignedURL] ❌ Missing params:", {
        userId,
        fileName,
        fileType,
      });
      throw new Error("Missing required parameters");
    }

    const filePath = `${userId}/${fileType}/${fileName}.pdf`;

    console.info(
      `[generateUploadPresignedURL] 🧾 Creating signed URL for: ${filePath}`
    );

    const { data, error } = await supabase.storage
      .from("user-files")
      .createSignedUploadUrl(filePath, { expiresIn: 60 });

    if (error) {
      throw new Error(`Supabase Storage error`);
    }


    return data;
  } catch (err) {

    throw new Error(`Internal Server Error: ${err.message}`);
  }
}
