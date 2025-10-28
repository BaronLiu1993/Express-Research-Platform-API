import express from "express";
import { verifyToken } from "../../services/authServices.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

function cleanSnippetPlaceholders(str) {
  return str.replace(/\/(?=\{\{)/g, "");
}

function removeBracketPlaceholders(str) {
  if (typeof str !== "string") return str;
  return str.replace(/\{\{(.*?)\}\}/g, "$1");
}

router.post("/insert", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  console.log("fired");
  const { snippet_html, snippet_subject } = req.body;

  const parsedSnippetHtml = cleanSnippetPlaceholders(snippet_html);
  const identifier = uuidv4();
  try {
    const { data: insertionData, error: insertionError } =
      await req.supabaseClient
        .from("snippets")
        .insert({
          user_id: userId,
          snippet_html: parsedSnippetHtml,
          snippet_subject: snippet_subject,
          snippet_name: `${userId}-${identifier}-email-snippet`,
        })
        .single();

    if (insertionError) {
      return res.status(400).json({ message: "Failed To Insert" });
    }

    console.log(insertionError);

    const snippetId = insertionData.id;
    return res.status(200).json({ snippetId });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/sync-fetchable-variables", verifyToken, async (req, res) => {
  const { variableArray, professorIdArray } = req.body;
  console.log("fired");
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

      const { data: constantData, error: constantError } =
        await req.supabaseClient
          .from("Taishan")
          .select("email, name")
          .eq("id", professorId)
          .single();

      if (constantError) {
        return res.status(400).json({ message: "Failed to Fetch" });
      }

      const filteredFields = newVariableArray.filter(
        (v) => v !== "publications"
      );

      let variableData = {};
      if (filteredFields.length > 0) {
        const { data, error: variableError } = await req.supabaseClient
          .from("Taishan")
          .select(filteredFields.join())
          .eq("id", professorId)
          .single();

        variableData = data || {};
      }

      let publicationData;
      if (newVariableArray.includes("publications")) {
        publicationData = "";
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
        name: constantData.name,
      };

      if (Object.keys(dynamicFields).length > 0) {
        resultEntry.dynamicFields = dynamicFields;
      }

      result.push(resultEntry);
    }

    return res.status(200).json({ result, status: "synced" });
  } catch {
    return res.status(500).json({
      message: "Internal Server Error",
      status: "failed",
    });
  }
});

export default router;
