import { supabase } from "../../../supabase/supabase.js";
import express from "express";

const router = express.Router();

//Get Kanban
router.get("/kanban/get-in-progress/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: savedData, error: savedFetchError } = await supabase
      .from("InProgress")
      .select("*")
      .eq("user_id", userId)
      .limit(10);

    if (savedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: savedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

//Add To In Progress
router.post(
  "/kanban/add-in-progress/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    const {
      name,
      email,
      url,
      lab_url,
      research_interests,
      labs,
      department,
      faculty,
      school,
    } = req.body;

    if (!userId || !professorId) {
      return res.status(400).json({ message: "Frontend Error" });
    }

    try {
      const { data: savedData, error: fetchSavedError } = await supabase
        .from("Saved")
        .select("comments, professorId")
        .eq("professor_id", professorId)
        .eq("user_id", userId);

      let comments = "";

      // Remove from Saved if it exists
      if (savedData?.length > 0) {
        const { error: savedDataDeletionError } = await supabase
          .from("Saved")
          .delete()
          .eq("professor_id", professorId)
          .eq("user_id", userId);

        comments = savedData.comments;
        if (savedDataDeletionError) {
          return res
            .status(400)
            .json({ message: "Error In Deleting Duplicate Row" });
        }
      }

      // Insert into InProgress
      const { error: inProgressInsertionError } = await supabase
        .from("InProgress")
        .insert({
          user_id: userId,
          professor_id: professorId,
          name,
          email,
          url,
          lab_url,
          labs,
          department,
          faculty,
          school,
          research_interests,
          comments,
        })
        .single();

      if (inProgressInsertionError) {
        return res
          .status(400)
          .json({ message: "Failed to update application columns." });
      }

      // Fetch user profile
      const { data: profileData, error: profileFetchError } = await supabase
        .from("User_Profiles")
        .select("applied_professors, saved_professors")
        .eq("user_id", userId)
        .single();

      if (profileFetchError) {
        return res
          .status(400)
          .json({ message: "Could not fetch profile data." });
      }

      const currentSaved = profileData.saved_professors ?? [];
      const currentApplied = profileData.applied_professors ?? [];

      const alreadySaved = currentSaved.includes(professorId);
      const newApplied = [...currentApplied, professorId];

      if (alreadySaved) {
        const newSaved = currentSaved.filter(
          (prof) => String(prof) !== String(professorId)
        );
        const { error: profileIRError } = await supabase
          .from("User_Profiles")
          .update({
            saved_professors: newSaved,
            applied_professors: newApplied,
          })
          .eq("user_id", userId);

        if (profileIRError) {
          return res
            .status(400)
            .json({ message: "Insertion and Removal Error" });
        }
      } else {
        const { error: profileInsertionError } = await supabase
          .from("User_Profiles")
          .update({
            applied_professors: newApplied,
          })
          .eq("user_id", userId);

        if (profileInsertionError) {
          return res
            .status(400)
            .json({ message: "Insertion Error for Second Function" });
        }
      }
      return res.status(200).json({
        message: "Professor successfully added to 'In Progress' column.",
      });
    } catch (err) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

//Delete From In Progress
router.delete(
  "/kanban/delete-in-progress/:userId/:professorId",
  async (req, res) => {
    const { userId, professorId } = req.params;
    try {
      const { error: deletionError } = await supabase
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (deletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      const { data: profileData, error: profileFetchError } = await supabase
        .from("User_Profiles")
        .select("applied_professors")
        .eq("user_id", userId)
        .single();

      if (profileFetchError) {
        return res
          .status(400)
          .json({ message: "Could not fetch profile data." });
      }

      const currentApplied = profileData.applied_professors;
      const newApplied = currentApplied.filter(
        (prof) => String(prof) !== professorId
      );

      const { error: profileError } = await supabase
        .from("User_Profiles")
        .update({
          applied_professors: newApplied,
        })
        .eq("user_id", userId);
      if (profileError) {
        return res
          .status(400)
          .json({ message: "Could not fetch profile data." });
      }

      return res.status(200).json({ message: "Delete Successful" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

export default router
