import { supabase } from "../../supabase/supabase.js";
import express from "express";

import path from "path";
import { fileURLToPath } from "url";

const router = express.Router()

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get("/pixel.png", async (req, res) => {
  const { analyticId } = req.query;
  // Get The Tracking ID and insert
  if (analyticId) {
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("Messages")
      .update({ opened_email_at: timestamp, opened_email: true })
      .eq("tracking_id", analyticId);
    if (updateError) {
        return res.status(401).json({message: "Failed to Update"})
    }
  }
  res.sendFile(path.join(__dirname, "public", "pixel.png"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
});

export default router