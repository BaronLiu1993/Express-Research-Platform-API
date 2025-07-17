import express from "express";
import { supabase } from "../../../supabase/supabase.js";

const router = express.Router();

router.get("/kanban/get-saved/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: savedData, error: savedFetchError } = await supabase
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

router.post("/kanban/add-saved/:userId/:professorId", async (req, res) => {
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
    comments,
  } = req.body;
  try {
    const { error: savedInsertionError } = await supabase
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

    const { data: profileData, error: profileFetchError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (profileFetchError) {
      return res.status(400).json({ message: "Could not fetch profile data." });
    }

    const currentSaved = profileData?.saved_professors || [];
    const alreadySaved = currentSaved.includes(professorId);

    if (!alreadySaved) {
      const updatedSaved = [...currentSaved, professorId];
      const { error: savedUpdateError } = await supabase
        .from("User_Profiles")
        .update({ saved_professors: updatedSaved })
        .eq("user_id", userId);

      if (savedUpdateError) {
        return res
          .status(400)
          .json({ message: "Could not update saved professors." });
      }
    }

    return res.status(200).json({ message: "Professor saved successfully." });
  } catch (err) {
    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

router.delete("/kanban/remove-saved/:userId/:professorId", async (req, res) => {
  const { userId, professorId } = req.params;

  if (!professorId || !userId) {
    return res
      .status(400)
      .json({ message: "Professor ID and User ID is required." });
  }
  try {
    const { error: savedDeletionError } = await supabase
      .from("Saved")
      .delete()
      .eq("user_id", userId)
      .eq("professor_id", professorId);

    if (savedDeletionError) {
      return res
        .status(400)
        .json({ message: "Could not delete application data." });
    }

    const { data: savedData, error: savedDataFetchError } = await supabase
      .from("User_Profiles")
      .select("saved_professors")
      .eq("user_id", userId)
      .single();

    if (savedDataFetchError) {
      return res.status(400).json({ message: "Failed to Fetch Data" });
    }
    const prevSaved = savedData.saved_professors;
    const newSaved = prevSaved.filter(
      (prof) => String(prof) !== String(professorId)
    );

    if (prevSaved.length !== newSaved.length) {
      const { error: arrayUpdateError } = await supabase
        .from("User_Profiles")
        .update({ saved_professors: newSaved })
        .eq("user_id", userId);
      if (arrayUpdateError) {
        return res
          .status(400)
          .json({ message: "Could not update application data." });
      }
    }

    return res.status(200).json({ message: "Professor removed successfully." });
  } catch (err) {
    console.log(err);

    return res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router