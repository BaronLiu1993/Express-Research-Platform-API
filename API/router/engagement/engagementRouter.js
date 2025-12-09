import { supabase } from "../../supabase/supabase.js";
import express from "express";

import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get("/hi.png", async (req, res) => {
  try {
    const { analyticId } = req.query;
    if (analyticId) {
      const timestamp = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("Messages")
        .update({ opened_email_at: timestamp, opened_email: true })
        .eq("tracking_id", analyticId);

      if (updateError) {
        return res.status(400).json({ message: "Failed to update" });
      }
    }

    res.sendFile(path.join(__dirname, "public", "hi.png"), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    return res.status(500).json({ message: "Failed to update" });
  }
});

export default router;
