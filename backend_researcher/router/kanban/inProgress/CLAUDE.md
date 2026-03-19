# CLAUDE.md for the backend_researcher/router/kanban/inProgress/ Folder

## Purpose
The `backend_researcher/router/kanban/inProgress/` folder manages routes related specifically to the Kanban board's "In Progress" tasks. This includes endpoints for retrieving applied professor IDs, fetching ongoing projects, and retrieving drafts associated with the user's work. It plays a crucial role in providing the application with the necessary API endpoints to handle tasks that are currently underway in the Kanban workflow.

If this folder were deleted, the application would lose all ability to access and manage in-progress tasks, significantly hindering the task management features for users, likely leaving them unable to track ongoing work or fetch draft emails tied to active engagements.

## Files
### 1. backend_researcher/router/kanban/inProgress/inProgressRouter.js
- **What it does**: Defines the API routes for fetching in-progress professor IDs, ongoing tasks, and drafts related to users' email engagements. Implements route handlers that communicate with the Supabase backend to retrieve and manage data.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.012629
- **Why it matters**: This file provides essential routes that allow users to manage and retrieve information about their ongoing projects and associated drafts. It integrates tightly with Supabase to ensure that the application can manage real-time user data efficiently.

## Dependency Map
### For `backend_researcher/router/kanban/inProgress/inProgressRouter.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To facilitate the creation of an Express router and define routes.
  - **HOW it’s used**: `express.Router()` is called to create a new router instance that handles specific API paths.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To secure the routes by ensuring that only authenticated users can access in-progress data.
  - **HOW it’s used**: The `verifyToken` middleware is applied to the route handlers, ensuring that only valid requests are processed.

## Inbound Dependencies
- **backend_researcher/index.js**: This file imports `inProgressRouter.js` as part of the application’s main routing setup, integrating the Kanban in-progress routes into the overall API.

## Data Flow
1. **Data Entry**: The data enters through HTTP GET requests made to the defined routes (e.g., `/repository/get-all-appliedId` and `/kanban/get-in-progress`).
2. **Transformations**: The routes read the user ID from the token (verified by `verifyToken`), then query the Supabase database for professor IDs or in-progress data.
3. **Data Exit**: Once the queries are executed, responses containing the requested data are sent back to the user in JSON format, providing insights into current projects or drafts.

## Key Patterns
- **Middleware for Authentication**: The use of middleware (`verifyToken`) ensures that only authenticated users access sensitive endpoints, aligning with best practices for securing API routes.
- **RESTful Routing**: The folder's design follows RESTful conventions by using appropriate HTTP methods and defining clear paths for resource access, enhancing the maintainability and clarity of the API.

---
## Relationship Map
### backend_researcher/router/kanban/inProgress/inProgressRouter.js
```javascript
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
  const userId = req.user.sub;
  const pageNumber = 1;
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
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This CLAUDE.md documentation of the `backend_researcher/router/kanban/inProgress/` folder summarizes its purpose, functionality, data flow, and relationships, providing a clear understanding for developers working with the project's routing architecture concerning in-progress Kanban tasks.