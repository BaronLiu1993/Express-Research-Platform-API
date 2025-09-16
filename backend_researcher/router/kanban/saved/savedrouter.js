import express from "express";
import { verifyToken } from "../../../services/authServices.js";

const router = express.Router();

router.get("/repository/get-all-savedId", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: professorIdData, error: professorIdFetchError } =
      await req.supabaseClient
        .from("Saved")
        .select("professor_id")
        .eq("user_id", userId);


    if (professorIdFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }

    const professorIds = professorIdData.map((item) => item.professor_id);
    return res.status(200).json({ data: professorIds });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/kanban/get-saved", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: savedData, error: savedFetchError } = await req.supabaseClient
      .from("Saved")
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

router.post(
  "/kanban/add-saved/:userId/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;
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
      comments,
    } = req.body;
    try {
      const { error: savedInsertionError } = await req.supabaseClient
        .from("Saved")
        .insert({
          user_id: userId,
          professor_id: professorId,
          name: name,
          email: email,
          url: url,
          lab_url: lab_url,
          labs: labs,
          department: department,
          faculty: faculty,
          school: school,
          research_interests: research_interests,
          comments: comments,
        })
        .single();
      if (savedInsertionError) {
        return res
          .status(400)
          .json({ message: "Could not fetch application data." });
      }

      return res.status(200).json({ message: "Professor saved successfully." });
    } catch (err) {
      return res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

router.delete(
  "/kanban/remove-saved/:userId/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;

    if (!professorId || !userId) {
      return res
        .status(400)
        .json({ message: "Professor ID and User ID is required." });
    }
    try {
      const { error: savedDeletionError } = await req.supabaseClient
        .from("Saved")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (savedDeletionError) {
        return res
          .status(400)
          .json({ message: "Could not delete application data." });
      }
      return res
        .status(200)
        .json({ message: "Professor removed successfully." });
    } catch (err) {
      return res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

export default router;
