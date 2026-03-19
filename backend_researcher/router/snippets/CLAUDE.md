# CLAUDE.md for the backend_researcher/router/snippets/ Folder

## Purpose
The `backend_researcher/router/snippets/` folder handles routes related to managing snippets of content that users can create, modify, or retrieve. This includes inserting new snippets, syncing variable information for use in email templates, and possibly other future functionalities related to snippets. 

If this folder were deleted, users would lose the ability to manage their snippets, significantly impacting their ability to create personalized email drafts and communications. This would disrupt the overall functionality of the application focused on facilitating academic engagement.

## Files
### 1. backend_researcher/router/snippets/snippetsRouter.js
- **What it does**: Defines API endpoints for inserting snippets, cleaning placeholder variables, and processing input for variable data fetching. It integrates with the Supabase backend to manage snippet data.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.011582
- **Why it matters**: This file is essential for allowing users to create and manage email snippets, which are pivotal for customizing email communications. It provides the necessary routes for users to store templates and automate parts of their communication strategies.

## Dependency Map
### For `backend_researcher/router/snippets/snippetsRouter.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create a router instance and manage API routes for snippet functionality.
  - **HOW it’s used**: The `express.Router()` method creates a new router for handling snippet-related API calls.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To ensure that only authenticated users can access the snippet-related endpoints.
  - **HOW it’s used**: The `verifyToken` middleware is applied to the route handlers to check user authentication before processing requests.

## Inbound Dependencies
- **backend_researcher/index.js**: The main entry point imports `snippetsRouter.js`, integrating these routes into the overall routing structure of the application, ensuring users have access to snippet-related functionalities.

## Data Flow
1. **Data Entry**: Data enters through HTTP POST requests directed at defined endpoints, such as `/insert` and `/sync-fetchable-variables`.
2. **Transformations**: The router processes incoming requests, where snippets create parsed HTML content. User data and snippet content is prepared and sent to the Supabase database.
3. **Data Exit**: After processing requests, responses indicating success, insertion IDs, or error messages are sent back to the client in JSON format.

## Key Patterns
- **Middleware for Authentication**: The pattern of using `verifyToken` middleware across all routes reinforces secure access control, ensuring that only authenticated users can manage snippets.
- **Dynamic Input Processing**: Methods for cleaning and manipulating snippet data (e.g., `cleanSnippetPlaceholders`, `removeBracketPlaceholders`) showcase a pattern of preparing and validating user inputs before database interactions, promoting data integrity.
- **RESTful API Design**: The router follows RESTful principles, employing appropriate HTTP methods for managing resources (i.e., snippets), which enhances usability and consistency with established API conventions.

---
## Relationship Map
### backend_researcher/router/snippets/snippetsRouter.js
```javascript
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
  console.log("fired");
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

    const snippetId = insertionData.id;
    return res.status(200).json({ snippetId });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Sync fetchable variables
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
      // Process further...
    }
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This CLAUDE.md documentation of the `backend_researcher/router/snippets/` folder comprehensively outlines its purpose, files, functionality, data flow, and relationship to the overall codebase, providing an essential resource for developers working with this aspect of the application.