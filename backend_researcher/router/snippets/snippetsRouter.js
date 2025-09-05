import express from "express";
import { verifyToken } from "../../services/authServices.js";

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
  const { snippet_html, snippet_subject } = req.body;

  const parsedSnippetHtml = cleanSnippetPlaceholders(snippet_html);
  try {
    const { data: insertionData, error: insertionError } =
      await req.supabaseClient
        .from("snippets")
        .insert({
          user_id: userId,
          snippet_html: parsedSnippetHtml,
          snippet_subject: snippet_subject,
          snippet_name: `${userId}Snippet`,
        })
        .select()
        .single();

    if (insertionError) {
      return res.status(400).json({ message: "Failed To Insert" });
    }

    console.log(insertionError)

    const snippetId = insertionData.id;
    return res.status(200).json({ snippetId });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/sync-fetchable-variables", verifyToken, async (req, res) => {
  const { variableArray, professorIdArray } = req.body;
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

router.post(
  "/sync-fetchable-variables/follow-up",
  verifyToken,
  async (req, res) => {
    const { variableArray, professorIdArray } = req.body;

    console.log("Incoming request body:", {
      variableArray,
      professorIdArray,
    });

    if (!Array.isArray(variableArray) || !Array.isArray(professorIdArray)) {
      console.error("Invalid input arrays", {
        variableArray,
        professorIdArray,
      });
      return res.status(400).json({ message: "Invalid input arrays" });
    }

    if (variableArray.length === 0 || professorIdArray.length === 0) {
      console.warn("Empty arrays received");
      return res.status(400).json({ message: "User Sent Nothing" });
    }

    const newVariableArray = variableArray.map(removeBracketPlaceholders);
    console.log("Processed variableArray ->", newVariableArray);

    const result = [];

    try {
      for (let i = 0; i < professorIdArray.length; i++) {
        const professorId = professorIdArray[i]["professor_id"];
        const messageId = professorIdArray[i]["message_id"];
        const threadId = professorIdArray[i]["thread_id"];
        const email = professorIdArray[i]["professor_email"];
        const name = professorIdArray[i]["professor_name"];

        console.log(`\nProcessing professor #${i}:`, {
          professorId,
          threadId,
          email,
          name,
        });

        const filteredFields = newVariableArray.filter(
          (v) => v !== "publications"
        );
        console.log("Filtered fields:", filteredFields);

        let variableData = {};
        if (filteredFields.length > 0) {
          const { data, error: variableError } = await req.supabaseClient
            .from("Taishan")
            .select(filteredFields.join())
            .eq("id", professorId)
            .single();

          console.log("Supabase variableData result:", { data, variableError });

          variableData = data || {};
        }

        let publicationData;
        if (newVariableArray.includes("publications")) {
          publicationData = "";
          console.log("Publications requested -> setting empty string for now");
        }

        const dynamicFields = {};
        if (Object.keys(variableData).length > 0) {
          Object.assign(dynamicFields, variableData);
        }
        if (publicationData !== undefined) {
          dynamicFields.publications = publicationData;
        }

        console.log("Final dynamicFields for this professor:", dynamicFields);

        const resultEntry = {
          id: professorId,
          email,
          name,
          messageId,
        };

        if (Object.keys(dynamicFields).length > 0) {
          resultEntry.dynamicFields = dynamicFields;
        }

        result.push(resultEntry);
      }

      return res.status(200).json({ result, status: "synced" });
    } catch (err) {
      console.error("Error in follow-up sync:", err);
      return res.status(500).json({
        message: "Internal Server Error",
        status: "failed",
      });
    }
  }
);

export default router;
