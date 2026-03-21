import express from "express";
import { verifyToken } from "../../services/authServices.js";
import {
  ProfessorIdParamSchema,
  ChangeStatusSchema,
  SaveProfessorSchema,
  SavedPageSchema,
} from "../../schema/savedSchema.js";

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
  const pageParsed = SavedPageSchema.safeParse(req.query);
  const page = pageParsed.success ? pageParsed.data.page : 1;
  const limit = 30;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  try {
    const { data: savedData, error: savedDataFetchError } =
      await req.supabaseClient
        .from("Saved")
        .select("*")
        .eq("user_id", userId)
        .range(from, to);
    if (savedDataFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: savedData });
  } catch (e) {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

router.put(
  "/kanban/change-status/:professorId",
  verifyToken,
  async (req, res) => {
    const userId = req.user.sub;
    const paramsParsed = ProfessorIdParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ completed: false, message: "Invalid professor ID." });
    }
    const { professorId } = paramsParsed.data;
    const bodyParsed = ChangeStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ completed: false, message: "Invalid status." });
    }
    const { status } = bodyParsed.data;
    try {
      const { error: savedUpdateError } = await req.supabaseClient
        .from("Saved")
        .update({ status })
        .eq("user_id", userId)
        .eq("professor_id", professorId)
        .single();

      if (savedUpdateError) {
        return res.status(400).json({
          completed: false,
          message: "Failed To Update.",
        });
      }

      return res
        .status(200)
        .json({ completed: true, message: "Professor Status Updated." });
    } catch (err) {
      return res
        .status(500)
        .json({ completed: false, message: "Internal Server Error" });
    }
  }
);

router.post("/kanban/add-saved/:professorId", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const paramsParsed = ProfessorIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ message: "Invalid professor ID." });
  }
  const { professorId } = paramsParsed.data;
  const bodyParsed = SaveProfessorSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ message: "Invalid request body." });
  }
  const { name, email, url, lab_url, research_interests, labs, department, faculty, school } =
    bodyParsed.data;
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
      })
      .single();
    if (savedInsertionError) {
      return res
        .status(400)
        .json({ message: "Could not add data to database." });
    }
    return res.status(200).json({ message: "Professor saved successfully." });
  } catch (err) {
    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

router.delete(
  "/kanban/remove-saved/:professorId",
  verifyToken,
  async (req, res) => {
    const paramsParsed = ProfessorIdParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ message: "Professor ID and User ID is required." });
    }
    const { professorId } = paramsParsed.data;
    const userId = req.user.sub;
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
