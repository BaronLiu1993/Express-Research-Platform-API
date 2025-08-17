import { supabase } from "../../../supabase/supabase.js";
import express from "express";

const router = express.Router();

//Get Method
router.get("/kanban/get-completed/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: completedData, error: completedFetchError } = await supabase
      .from("Completed")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (completedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }
    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});


router.delete(
  "/kanban/delete-completed/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    try {
      const { error: deletionError } = await supabase
        .from("Completed")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (deletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      return res.status(200).json({ message: "Delete Successful" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

//Post Method
router.post("/kanban/add-completed/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;

  if (!userId || !professorId) {
    return res.status(400).json({ message: "Frontend Error" });
  }

  try {
    // Insert into completed
    const { data: inProgressData, error: inProgressFetchError } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .single();

    if (inProgressFetchError) {
      return res.status(400).json({ message: "fetch error" });
    }
    const { error: completedInsertionError } = await supabase
      .from("Completed")
      .insert({
        user_id: inProgressData.user_id,
        professor_id: inProgressData.professor_id,
        name: inProgressData.name,
        email: inProgressData.email,
        url: inProgressData.url,
        lab_url: inProgressData.lab_url,
        labs: inProgressData.labs,
        department: inProgressData.department,
        faculty: inProgressData.faculty,
        school: inProgressData.school,
        research_interests: inProgressData.research_interests,
        comments: inProgressData.comments,
      })
      .single();

    if (completedInsertionError) {
      return res
        .status(400)
        .json({ message: "Failed to update application columns." });
    }

    // delete from in progress
    const { error: inProgressDeletionError } = await supabase
      .from("InProgress")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId);

    if (inProgressDeletionError) {
      return res.status(400).json({ message: "Failed to delete" });
    }

    return res
      .status(200)
      .json({ message: "Professor successfully added to 'Completed' column." });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
