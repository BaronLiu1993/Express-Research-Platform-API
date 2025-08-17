import { supabase } from "../../supabase/supabase.js";
import express from "express";

const router = express.Router();

//Implement Pagination Too
router.get("/get-grants", async (req, res) => {
  try {
    const { data: grantData, error: grantFetchError } = await supabase
      .from("Grants")
      .select("*");

    if (grantFetchError) {
      return res.status(400).json({ message: "Failed To Fetch" });
    }

    return res.status(200).json({ data: grantData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router
