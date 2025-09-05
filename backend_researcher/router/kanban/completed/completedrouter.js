import { supabase } from "../../../supabase/supabase.js";
import express from "express";
import { verifyToken } from "../../../services/authServices.js";

const router = express.Router();

router.get("/workspace/completed-data", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: completedData, error: completedDataFetchError } =
      await req.supabaseClient
        .from("Emails")
        .select(
          "thread_id, message_id, professor_id, professor_name, professor_email"
        )
        .eq("user_id", userId)
        .eq("type", "first")
        .eq("sent", true);

    if (completedDataFetchError) {
      return res
        .status(400)
        .json({ message: "Failed To Fetch COmpleted Data" });
    }
    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Failed to Get" });
  }
});

router.get("/kanban/get-completed", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: completedData, error: completedFetchError } =
      await req.supabaseClient
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
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;
    try {
      const { error: deletionError } = await req.supabaseClient
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

router.post(
  "/kanban/add-completed/:userId/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;

    if (!userId || !professorId) {
      return res.status(400).json({ message: "Frontend Error" });
    }

    try {
      const { data: inProgressData, error: inProgressFetchError } =
        await req.supabaseClient
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

      const { error: inProgressDeletionError } = await req.supabaseClient
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (inProgressDeletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      return res
        .status(200)
        .json({
          message: "Professor successfully added to 'Completed' column.",
        });
    } catch {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

export default router;
