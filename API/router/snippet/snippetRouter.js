import express from "express";
import { verifyToken } from "../../services/authServices.js";
import { v4 as uuidv4 } from "uuid";
import { AuthIdSchema } from "../../schema/authSchema.js";

const router = express.Router();

// Helper Functions
function cleanSnippetPlaceholders(str) {
  if (typeof str !== "string") return str;
  return str.replace(/\/(?=\{\{)/g, "");
}

function removeBracketPlaceholders(str) {
  if (typeof str !== "string") return str;
  return str.replace(/\{\{(.*?)\}\}/g, "$1");
}

router.post("/insert-snippet", verifyToken, async (req, res) => {
  const authParsed = AuthIdSchema.safeParse(req.user);

  if (!authParsed.success) {
    return res.status(401).json({
      message: "Invalid auth token.",
    });
  }

  const userId = authParsed.data.sub;

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
        .select()
        .single();

    if (insertionError) {
      return res.status(400).json({ message: "Failed To Insert" });
    }

    const snippetId = insertionData.id;
    return res.status(200).json({ snippetId });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/sync-variables", verifyToken, async (req, res) => {
  const { variableArray, professorIdArray } = req.body;
  const authParsed = AuthIdSchema.safeParse(req.user);

  if (!authParsed.success) {
    return res.status(401).json({
      message: "Invalid auth token.",
    });
  }

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

      const { data: constantData, error: constantError } =
        await req.supabaseClient
          .from("Taishan")
          .select("email, name")
          .eq("id", professorId)
          .single();

      if (constantError) {
        return res.status(400).json({ message: "Failed to Fetch" });
      }

      let variableData = {};
      if (newVariableArray.length > 0) {
        const { data: filteredData, error: variableError } =
          await req.supabaseClient
            .from("Taishan")
            .select(newVariableArray.join())
            .eq("id", professorId)
            .single();

        if (variableError) {
          return res.status(400).json({ message: "Failed to Filter." });
        }

        variableData = filteredData || {};
      }

      const dynamicFields = {};
      if (Object.keys(variableData).length > 0) {
        Object.assign(dynamicFields, variableData);
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

    return res.status(200).json({ result, completed: true });
  } catch (err) {
    return res.status(500).json({
      message: "Internal Server Error",
      completed: false,
    });
  }
});

export default router;
