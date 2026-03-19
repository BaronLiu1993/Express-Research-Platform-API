# CLAUDE.md for the backend_researcher/router/kanban/completed/ Folder

## Purpose
The `backend_researcher/router/kanban/completed/` folder is tasked with managing all routes related to "completed" tasks in the Kanban workflow. This includes functionality for retrieving completed email interactions, managing associated data, and enabling users to delete or add completed entries. 

If this folder were deleted, the application would lose the ability to track and manage completed tasks, thus hindering the comprehensive task management capabilities essential for user engagement and workflow tracking.

## Files
### 1. backend_researcher/router/kanban/completed/completedrouter.js
- **What it does**: Defines API endpoints for fetching completed email interactions, retrieving user-specific completed task data, adding new completed tasks, and deleting existing ones.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.012353
- **Why it matters**: This file is crucial for providing users with the means to view and manage their completed tasks efficiently, ensuring that completed interactions are properly tracked and accessible.

## Dependency Map
### For `backend_researcher/router/kanban/completed/completedrouter.js`
- **→ imports `backend_researcher/supabase/supabase.js`**: 
  - **WHAT is imported**: The Supabase client instance.
  - **WHY it’s needed**: Allows the router to interact with the Supabase backend for querying and managing completed task data.
  - **HOW it’s used**: Queries are made to the `Emails` and `Completed` tables to fetch and manage data based on user interactions.

- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: Required to create the router and define API routes.
  - **HOW it’s used**: The `express.Router()` method creates a new instance to handle specific routes related to completed tasks.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To secure the routes by ensuring that only authenticated users can access completed tasks.
  - **HOW it’s used**: The `verifyToken` middleware is applied to the route handlers, validating user requests before processing.

## Inbound Dependencies
- **backend_researcher/index.js**: This main file imports `completedrouter.js` to incorporate the Kanban completed task routes into the overall API structure, integrating them into the application’s routing logic.

## Data Flow
1. **Data Entry**: Data enters through HTTP GET requests made to endpoints such as `/workspace/completed-data` and POST requests for adding completed tasks.
2. **Transformations**: Each route processes the incoming requests by extracting the user ID (validated via `verifyToken`) and performing operations on the Supabase database to retrieve or modify completed task information.
3. **Data Exit**: The results of the Supabase queries are sent back in JSON format as responses, informing users of their completed tasks or the status of any modification requests (like additions or deletions).

## Key Patterns
- **Authentication Middleware**: The consistent use of `verifyToken` as middleware across routes ensures that sensitive operations are protected, following best practices in API security.
- **RESTful Routing**: The routes are designed to follow RESTful conventions, utilizing standard HTTP methods (GET, POST, DELETE) to manage resource states, thereby promoting clarity and consistency throughout the API.

---
## Relationship Map
### backend_researcher/router/kanban/completed/completedrouter.js
```javascript
import { supabase } from "../../../supabase/supabase.js";
import express from "express";
import { verifyToken } from "../../../services/authServices.js";

const router = express.Router();

router.get("/workspace/completed-data", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: completedData, error: completedDataFetchError } =
      await req.supabaseClient
        .from("Emails")
        .select(
          "thread_id, message_id, professor_id, professor_name, professor_email"
        )
        .eq("user_id", userId)
        .eq("type", "first")
        .eq("sent", true);

    if (completedDataFetchError) {
      return res
        .status(400)
        .json({ message: "Failed To Fetch Completed Data" });
    }
    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Failed to Get" });
  }
});

// Get Kanban completed tasks
router.get("/kanban/get-completed", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const pageNumber = 1;
  const limit = 10;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = req.supabaseClient
      .from("Completed")
      .select("*")
      .eq("user_id", userId);

    query = query.range(from, to);

    const { data: completedData, error: completedFetchError } = await query;

    if (completedFetchError) {
      return res.status(400).json({ message: "Unable to Fetch Data" });
    }

    return res.status(200).json({ data: completedData });
  } catch {
    return res.status(500).json({ message: "Internal Service Error" });
  }
});

// Delete completed tasks
router.delete(
  "/kanban/delete-completed/:userId/:professorId",
  verifyToken,
  async (req, res) => {
    const { professorId } = req.params;
    const userId = req.user.sub;
    try {
      const { error: deletionError } = await req.supabaseClient
        .from("Completed")
        .delete()
        .eq("user_id", userId)
        .eq("professor_id", professorId);

      if (deletionError) {
        return res.status(400).json({ message: "Failed to delete" });
      }

      return res.status(200).json({ message: "Delete Successful" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);
```

**→ imports `backend_researcher/supabase/supabase.js`**  
Target pagerank: 0.018459

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This CLAUDE.md documentation for the `backend_researcher/router/kanban/completed/` folder outlines its purpose, functionality, data flow, and relationships, ensuring developers have a clear understanding of its role within the overall application architecture.