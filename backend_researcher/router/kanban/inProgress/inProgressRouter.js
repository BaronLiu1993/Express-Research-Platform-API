import { supabase } from "../../../supabase/supabase.js";
import express from "express";

const router = express.Router();

router.get("/repository/get-all-appliedId/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: professorIdData, error: professorIdFetchError } =
      await supabase
        .from("InProgress")
        .select("professor_id")
        .eq("user_id", userId);
    if (professorIdFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }
    return res.status(200).json({ data: professorIdData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

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

router.get("/fetch/draft/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: draftData, error: fetchError } = await supabase
      .from("Emails")
      .select("draft_id, professor_id")
      .eq("user_id", userId);

    let totalDraftData = [];
    await Promise.all(
      draftData.map(async (prof) => {
        const { data: professorData, error: professorFetchError } =
          await supabase
            .from("Taishan")
            .select("name, email")
            .eq("id", prof.professor_id)
            .single();
        totalDraftData.push({
          draft_id: prof.draft_id,
          id: prof.professor_id,
          name: professorData.name,
          email: professorData.email,
        });
      })
    );

    if (fetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }
    return res.status(200).json({ data: totalDraftData });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
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

      return res.status(200).json({
        message: "Professor successfully added to In Progress column.",
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
        .eq("professor_id", Number(professorId));

      if (deletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      return res.status(200).json({ message: "Delete Successful" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

export default router;
