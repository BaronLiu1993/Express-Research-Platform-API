# CLAUDE.md for the backend_researcher/router/repository/ Folder

## Purpose
The `backend_researcher/router/repository/` folder manages routes related to retrieving information about academic researchers, particularly entries from the "Taishan" database. This functionality typically includes filtering and listing researchers based on various criteria set by the user, such as school, faculty, or department. 

If this folder were deleted, the application would lose all ability to query and manage researcher data, severely limiting users' capabilities to access and engage with relevant academic profiles. Researchers or users would not be able to leverage the available data for networking, collaboration, or funding applications.

## Files
### 1. backend_researcher/router/repository/repositoryRouter.js
- **What it does**: Defines the API routes for fetching researchers from the Taishan database and filtering them based on user queries. Provides secure access through token verification.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.011582
- **Why it matters**: This file provides essential endpoints for users to access valuable academic researcher data, enabling efficient querying and facilitating user engagement with potential collaborators in research.

## Dependency Map
### For `backend_researcher/router/repository/repositoryRouter.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create a router instance and define API routes.
  - **HOW it’s used**: The `express.Router()` method is invoked to create a new router for handling incoming requests related to researcher data.

- **→ imports `openai`**: 
  - **WHAT is imported**: The OpenAI SDK.
  - **WHY it’s needed**: To initialize an OpenAI client which might be used for natural language processing tasks (though it appears unused in this particular implementation).
  - **HOW it’s used**: Initialized at the beginning of the file, but no functions are called within the shown code.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: A library for managing environment variables.
  - **WHY it’s needed**: To securely handle sensitive configuration details like API keys.
  - **HOW it’s used**: Call to `dotenv.config()` is made to load environment variables into the application.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To secure the routes by ensuring only authenticated users have access to researcher data.
  - **HOW it’s used**: The `verifyToken` middleware is applied to the route handlers, validating user requests before allowing access to researcher data.

## Inbound Dependencies
- **backend_researcher/index.js**: This main file imports `repositoryRouter.js`, integrating it into the overall routing structure of the application, allowing users to access routes related to academic researcher data.

## Data Flow
1. **Data Entry**: Data enters through HTTP GET requests sent to the defined routes, such as `/taishan/filter` and `/taishan`.
2. **Transformations**: The router processes incoming requests to obtain user context (via `verifyToken`) and subsequently queries the Supabase backend for requested researcher data based on provided filters.
3. **Data Exit**: The results obtained from Supabase are sent back to the client as responses in JSON format, providing the relevant academic researcher information or error messages when fetching data fails.

## Key Patterns
- **Middleware for Authentication**: The consistent implementation of the `verifyToken` middleware ensures that sensitive routes are secured, which is a best practice in API design.
- **Dynamic Querying**: The router handles queries that can dynamically filter researchers based on user input (like school, faculty, department), allowing for flexible data retrieval and enhancing user experience.
- **Error Handling**: The routes include structured error handling to return meaningful HTTP responses, allowing clients to understand the outcome of their request better.

---
## Relationship Map
### backend_researcher/router/repository/repositoryRouter.js
```javascript
import express from "express";

//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";
import { verifyToken } from "../../services/authServices.js";

dotenv.config();

// Initialise OpenAI Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

const router = express.Router();

router.get("/taishan/filter", verifyToken, async (req, res) => {
  const { page = 1, school, faculty, department } = req.query;
  const pageNumber = parseInt(page);
  const limit = 20;
  const from = (pageNumber - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = req.supabaseClient
      .from("Taishan")
      .select(
        "id, name, url, school, department, faculty, bio, email, labs, lab_url, research_interests",
        { count: "exact" }
      );

    if (school) {
      const values = Array.isArray(school) ? school : [school];
      query = query.in("school", values.map((v) => v.trim()).filter(Boolean));
    }

    if (faculty) {
      const values = Array.isArray(faculty) ? faculty : [faculty];
      query = query.in("faculty", values.map((v) => v.trim()).filter(Boolean));
    }

    if (department) {
      const values = Array.isArray(department) ? department : [department];
      query = query.in(
        "department",
        values.map((v) => v.trim()).filter(Boolean)
      );
    }

    // Pagination
    query = query.range(from, to);

    const { data: tableData, error: tableDataError } = await query;

    if (tableDataError) {
      return res.status(400).json({ message: "Failed To Fetch Filtered Data" });
    }

    return res.status(200).json({ tableData });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `openai`**  
Target pagerank: 0.0

**→ imports `dotenv`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This CLAUDE.md documentation for the `backend_researcher/router/repository/` folder outlines its purpose, functionality, data flow, and relationship with other components in the back-end architecture, helping developers understand its role and integration within the overall application.