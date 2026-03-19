# CLAUDE.md for the backend_researcher/router/kanban/saved/ Folder

## Purpose
The `backend_researcher/router/kanban/saved/` folder contains routes that manage saved professor contacts and academic engagements within the Kanban board application. These routes allow users to retrieve, add, and manage saved entries related to professors, enhancing the application's functionality to track academic interactions efficiently.

If this folder were deleted, the ability to save and manage data about professors in the Kanban system would be lost, significantly impairing user engagement and task tracking features. Without this functionality, users would not be able to conveniently access or store important academic contacts.

## Files
### 1. backend_researcher/router/kanban/saved/savedrouter.js
- **What it does**: Defines the API routes for managing saved professor entries, including retrieving saved professor IDs, fetching saved data, and adding new saved records.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.012353
- **Why it matters**: This file is essential for allowing users to interact with their saved contacts effectively. It facilitates the storage and retrieval of valuable information about professors, which is crucial for managing academic engagement.

## Dependency Map
### For `backend_researcher/router/kanban/saved/savedrouter.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create the router instance and define routes for incoming requests.
  - **HOW it’s used**: The `express.Router()` method creates a new router instance dedicated to handling saved entry-related requests.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To secure routes by ensuring that only authenticated users can perform actions on saved tasks.
  - **HOW it’s used**: The `verifyToken` middleware is applied to all routes, validating user authentication before proceeding with any route logic.

- **→ imports `backend_researcher/supabase/supabase.js`**: 
  - **WHAT is imported**: The Supabase client instance.
  - **WHY it’s needed**: Provides functionality to interact with the Supabase backend for storing and retrieving saved professor data.
  - **HOW it’s used**: The `supabaseClient` is used in route handlers to perform database operations for fetching and inserting saved records.

## Inbound Dependencies
- **backend_researcher/index.js**: This main entry file imports `savedrouter.js` and integrates it into the overall routing structure of the application, allowing access to saved-related routes from within the full API.

## Data Flow
1. **Data Entry**: Data enters through HTTP GET or POST requests directed at the router endpoints (like `/repository/get-all-savedId` or `/kanban/add-saved/:professorId`).
2. **Transformations**: Each route processes the incoming request, extracting details such as user IDs (validated via `verifyToken`) and the professor ID. The routes then interact with the Supabase database to fetch or store the appropriate records.
3. **Data Exit**: Responses generated from these operations are sent back to the client in JSON format, delivering either the requested data or confirmation of successfully saved entries.

## Key Patterns
- **Middleware for Authentication**: The consistent use of `verifyToken` middleware reinforces security across all routes, adhering to best practices for protecting sensitive operations.
- **RESTful Routing Standards**: The design follows RESTful conventions with clear URL structures, making it easy for clients to interact with the API in a predictable manner.
- **Error Handling**: The implementation includes structured error responses, ensuring that clients receive meaningful feedback in case of issues while interacting with the API.

---
## Relationship Map
### backend_researcher/router/kanban/saved/savedrouter.js
```javascript
import express from "express";
import { verifyToken } from "../../../services/authServices.js";

const router = express.Router();

router.get("/repository/get-all-savedId", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    const { data: professorIdData, error: professorIdFetchError } =
      await req.supabaseClient
        .from("Saved")
        .select("professor_id")
        .eq("user_id", userId);

    if (professorIdFetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }

    const professorIds = professorIdData.map((item) => item.professor_id);
    return res.status(200).json({ data: professorIds });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Implement Pagination here, fix the send email with attachment function and clean up other logic
router.get("/kanban/get-saved", verifyToken, async (req, res) => {
  const userId = req.user.sub;
  const pageNumber = 1;
  const limit = 10;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = req.supabaseClient
      .from("Saved")
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

// Additional route implementations...
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

**→ imports `backend_researcher/supabase/supabase.js`**  
Target pagerank: 0.018459

---

This CLAUDE.md provides thorough documentation for the `backend_researcher/router/kanban/saved/` folder, outlining its purpose, functionality, data flow, and its role in the overall architecture, aiding developers in navigating and understanding this part of the application.