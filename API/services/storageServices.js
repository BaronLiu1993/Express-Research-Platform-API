import { supabase } from "../supabase/supabase.js";

export async function generateUploadPresignedURL({ userId, filename, fileType }) {
  try {
    const filePath = `${userId}/${fileType}/${filename}.pdf`;
    const { data: uploadUrlData, error: uploadUrlDataError } =
      await supabase.storage
        .from("user-files")
        .createSignedUploadUrl(filePath, { expiresIn: 60 });
    if (uploadUrlDataError) {
      throw new Error("Failed to Generate Presigned Upload URL");
    }
    return uploadUrlData;
  } catch {
    throw new Error("Internal Server Error");
  }
}
