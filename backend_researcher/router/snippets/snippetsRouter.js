import { supabase } from "../../supabase/supabase";
import express from "express";

const router = express.Router();

function cleanSnippetPlaceholders(str) {
  return str.replace(/\/(?=\{\{)/g, "");
}

router.post("/snippets/insert/:userId", async (req, res) => {
  const { userId } = req.params;
  const { snippet_html, snippet_subject } = req.body;

  const parsedSnippetHtml = cleanSnippetPlaceholders(snippet_html);
  try {
    const { data: insertionData, error: insertionError } = await supabase
      .from("snippets")
      .insert({
        user_id: userId,
        snippet_html: parsedSnippetHtml,
        snippet_subject: snippet_subject,
        snippet_name: "Test",
      })
      .select("id")
      .single();
    const snippetId = insertionData.id;
    return res.status(200).json({ snippetId });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/snippets/get-all/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: getData, error: getError } = await supabase
      .from("snippets")
      .select("id, snippet_html, snippet_subject")
      .eq("user_id", userId);
    return res.status(200).json({ message: getData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/sync-fetchable-variables/:userId", async (req, res) => {
  const { variableArray, professorIdArray } = req.body;
  const { userId } = req.params;

  if (!Array.isArray(variableArray) || !Array.isArray(professorIdArray)) {
    return res.status(400).json({ message: "Invalid input arrays" });
  }

  if (variableArray.length === 0 || professorIdArray.length === 0) {
    return res.status(400).json({ message: "User Sent Nothing" });
  }

  const newVariableArray = variableArray.map(cleanSnippetPlaceholders);
  const result = [];

  try {
    for (let i = 0; i < professorIdArray.length; i++) {
      const professorId = professorIdArray[i];

      const { data: constantData, error: constantError } = await supabase
        .from("Taishan")
        .select("id, email")
        .eq("id", professorId)
        .single();
      if (constantError) throw constantError;

      const filteredFields = newVariableArray.filter(
        (v) => v !== "publications"
      );

      let variableData = {};
      if (filteredFields.length > 0) {
        const { data, error: variableError } = await supabase
          .from("Taishan")
          .select(filteredFields.join())
          .eq("id", professorId)
          .single();
        if (variableError) throw variableError;
        variableData = data || {};
      }

      let publicationData;
      if (newVariableArray.includes("publications")) {
        const { data, error } = await supabase.rpc("match_publications", {
          student_id_param: userId,
          professor_id_param: professorId,
          match_threshold_param: 0.2,
          match_count_param: 1,
        });

        if (error) throw error;
        publicationData = data?.[0]?.title || "";
      }

      const dynamicFields = {};
      if (Object.keys(variableData).length > 0) {
        Object.assign(dynamicFields, variableData);
      }
      if (publicationData !== undefined) {
        dynamicFields.publications = publicationData;
      }

      const resultEntry = {
        id: constantData.id,
        email: constantData.email,
      };
      if (Object.keys(dynamicFields).length > 0) {
        resultEntry.dynamicFields = dynamicFields;
      }

      result.push(resultEntry);
    }

    return res.status(200).json({ result, status: "synced" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal Server Error",
      status: "failed",
    });
  }
});

export default router;
