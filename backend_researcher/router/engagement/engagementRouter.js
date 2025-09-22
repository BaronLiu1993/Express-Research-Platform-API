import { supabase } from "../../supabase/supabase.js";
import express from "express";

import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get("/pixel.png", async (req, res) => {
  const { analyticId } = req.query;
  console.log("Pixel request received");
  console.log(analyticId)

  if (analyticId) {
    const timestamp = new Date().toISOString();

    // Check if the record exists with the provided analyticId


    // Proceed with the update if the row exists
    const { error: updateError } = await supabase
      .from("Messages")
      .update({ opened_email_at: timestamp, opened_email: true })
      .eq("tracking_id", analyticId);

    console.log("Update error:", updateError);

    if (updateError) {
      return res.status(500).json({ message: "Failed to update" });
    } else {
      console.log("Email opened timestamp updated successfully");
    }
  } else {
    console.log("No analyticId provided");
  }

  // Send the pixel image response
  res.sendFile(path.join(__dirname, "public", "pixel.png"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
});


export default router;
