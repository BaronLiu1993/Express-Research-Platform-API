import { supabase } from "../../supabase/supabase.js";
import express from "express";

const router = express.Router();

function cleanSnippetPlaceholders(str) {
  return str.replace(/\/(?=\{\{)/g, "");
}

function removeBracketPlaceholders(str) {
  if (typeof str !== "string") return str;
  return str.replace(/\{\{(.*?)\}\}/g, "$1");
}


router.post("/insert/:userId", async (req, res) => {
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

router.get("/get-all/:userId", async (req, res) => {
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
  console.log(professorIdArray)
  console.log(variableArray)

  if (!Array.isArray(variableArray) || !Array.isArray(professorIdArray)) {
    return res.status(400).json({ message: "Invalid input arrays" });
  }

  if (variableArray.length === 0 || professorIdArray.length === 0) {
    return res.status(400).json({ message: "User Sent Nothing" });
  }

  const newVariableArray = variableArray.map(removeBracketPlaceholders);
  const result = [];

  try {
    for (let i = 0; i < professorIdArray.length; i++) {
      const professorId = professorIdArray[i];
      console.log(`🔍 Processing professorId [${i}]:`, professorId);

      const { data: constantData, error: constantError } = await supabase
        .from("Taishan")
        .select("email")
        .eq("id", professorId)
        .single();

      if (constantError) {
        return res.status(400).json({message: "Failed to Fetch"})
      }

      const filteredFields = newVariableArray.filter((v) => v !== "publications");

      let variableData = {};
      if (filteredFields.length > 0) {
        const { data, error: variableError } = await supabase
          .from("Taishan")
          .select(filteredFields.join())
          .eq("id", professorId)
          .single();

        variableData = data || {};
      }

      let publicationData;
      if (newVariableArray.includes("publications")) {
        publicationData = ""
      }

      const dynamicFields = {};
      if (Object.keys(variableData).length > 0) {
        Object.assign(dynamicFields, variableData);
      }
      if (publicationData !== undefined) {
        dynamicFields.publications = publicationData;
      }

      const resultEntry = {
        id: professorId,
        email: constantData.email,
      };

      if (Object.keys(dynamicFields).length > 0) {
        resultEntry.dynamicFields = dynamicFields;
      }

      result.push(resultEntry);
      console.log(`✅ Finished professorId [${i}]:`, resultEntry);
    }

    console.log("✅ [SUCCESS] Returning full result.");
    return res.status(200).json({ result, status: "synced" });

  } catch (err) {
    return res.status(500).json({
      message: "Internal Server Error",
      status: "failed",
    });
  }
});


export default router;
