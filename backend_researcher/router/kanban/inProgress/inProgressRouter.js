import express from "express";
import { verifyToken } from "../../../services/authServices.js";

const router = express.Router();

router.get("/repository/get-all-appliedId", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: professorIdData, error: professorIdFetchError } =
      await req.supabaseClient
        .from("InProgress")
        .select("professor_id")
        .eq("user_id", userId);

    if (professorIdFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }
    console.log(professorIdData);
    const professorIds = professorIdData.map((item) => item.professor_id);
    return res.status(200).json({ data: professorIds });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Get Kanban
router.get("/kanban/get-in-progress", verifyToken, async (req, res) => {
  const { page = 1 } = req.body;
  const userId = req.user.sub;
  const pageNumber = parseInt(page);
  const limit = 10;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;
  try {
    let query = req.supabaseClient
      .from("InProgress")
      .select("*")
      .eq("user_id", userId);

    query = query.range(from, to);

    const { data: savedData, error: savedFetchError } = await query;

    if (savedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: savedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

router.get("/fetch/draft", verifyToken, async (req, res) => {
  const { page = 1 } = req.body;
  const userId = req.user.sub;
  const pageNumber = parseInt(page);
  const limit = 10;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = req.supabaseClient
      .from("Emails")
      .select("draft_id, professor_id")
      .eq("user_id", userId)
      .eq("type", "draft");

    query = query.range(from, to);

    const { data: draftData, error: fetchError } = await query;

    let totalDraftData = [];
    await Promise.all(
      draftData.map(async (prof) => {
        const { data: professorData, error: professorFetchError } =
          await req.supabaseClient
            .from("Taishan")
            .select("name, email")
            .eq("id", prof.professor_id)
            .single();
        if (professorFetchError) {
          return res
            .status(400)
            .json({ message: "Failed To Fetch Professor Data" });
        }
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
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Add To In Progress
router.post(
  "/kanban/add-in-progress/:professorId",
  verifyToken,
  async (req, res) => {
    const userId = req.user.sub;
    const { professorId } = req.params;
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
      const { data: savedData, error: fetchSavedError } =
        await req.supabaseClient
          .from("Saved")
          .select("comments, professorId")
          .eq("professor_id", professorId)
          .eq("user_id", userId);

      let comments = "";

      if (fetchSavedError) {
        return res.status(400).json({ message: "Failed To Fetch Saved Data" });
      }

      if (savedData?.length > 0) {
        const { error: savedDataDeletionError } = await req.supabaseClient
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

      const { error: inProgressInsertionError } = await req.supabaseClient
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

router.delete(
  "/kanban/delete-in-progress/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;

    try {
      const { error: deletionError } = await req.supabaseClient
        .from("InProgress")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", parseInt(professorId));

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
