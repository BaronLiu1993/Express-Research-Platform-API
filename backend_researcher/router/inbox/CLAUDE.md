# CLAUDE.md for the backend_researcher/router/inbox/ Folder

## Purpose
The `backend_researcher/router/inbox/` folder manages routes associated with handling inbox-related functionality within the application. This includes retrieving email threads, checking if emails have been opened, and managing drafts. The operations performed by these routes are crucial for users who require an organized method to track and manage their email communications.

If this folder were deleted, the application would lose all integrations related to managing inbox functionality, disabling users from tracking their emails or interacting with threads. This would severely impact user engagement and the overall purpose of the application.

## Files
### 1. backend_researcher/router/inbox/draftRouter.js
- **What it does**: Defines API routes for creating follow-up drafts from existing email threads, securing these routes with token verification.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.008849
- **Why it matters**: This file is essential for managing email drafts, enabling users to create replies efficiently and automate parts of their email communication.

### 2. backend_researcher/router/inbox/inboxRouter.js
- **What it does**: Includes API routes for retrieving details about email visibility (open status) and fetching complete email chains. It allows users to see if their emails have been opened and to access the full context of conversations.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.008573
- **Why it matters**: This file is vital for giving users insights into their email interactions, significantly enhancing how users manage and respond to communications in their inbox.

## Dependency Map
### For `backend_researcher/router/inbox/draftRouter.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create and manage the API router instance for handling inbox routes.
  - **HOW it’s used**: The `express.Router()` method is called to create the router instance.

- **→ imports `backend_researcher/services/googleServices.js`** (multiple):
  - **WHAT is imported**: Functions for interacting with Google APIs.
  - **WHY it’s needed**: To handle OAuth configuration and email processing for drafts.
  - **HOW it’s used**: Functions like `configureOAuth`, `makeReplyBody`, and `makeBody` are called to prepare email drafts and handle responses.

- **→ imports `uuid`**: 
  - **WHAT is imported**: A library for generating unique identifiers.
  - **WHY it’s needed**: To create unique tracking IDs for follow-up drafts.
  - **HOW it’s used**: The function `uuidv4()` is called to generate unique IDs for individual draft tasks.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To secure routes ensuring only authenticated users can create drafts.
  - **HOW it’s used**: The `verifyToken` middleware is applied to routes, validating user requests.

### For `backend_researcher/router/inbox/inboxRouter.js`
- **→ imports `googleapis`**: 
  - **WHAT is imported**: Google API client library.
  - **WHY it’s needed**: To manage email operations, such as retrieving thread data.
  - **HOW it’s used**: The OAuth client is initialized to manage interactions with Gmail APIs.

- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To facilitate routing within the application.
  - **HOW it’s used**: The `express.Router()` method is called to create a new router instance.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: A library for managing environment variables.
  - **WHY it’s needed**: To load sensitive configuration information such as API keys.
  - **HOW it’s used**: Invoked at the beginning of the file with `dotenv.config()` to set up environment variables.

- **→ imports `backend_researcher/services/googleServices.js`** (multiple):
  - **WHAT is imported**: Functions for handling Google API interactions.
  - **WHY it’s needed**: To manage OAuth and email retrieval processes.
  - **HOW it’s used**: The imported functions are utilized throughout the routes to manage email visibility and fetching email threads.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To ensure user authentication for accessing sensitive inbox data.
  - **HOW it’s used**: This middleware is used to protect routes that manage user email accesses.

## Inbound Dependencies
- **backend_researcher/index.js**: This main file imports both `draftRouter.js` and `inboxRouter.js`, integrating all inbox-related functionalities into the overall application routing system.

## Data Flow
1. **Data Entry**: Data enters the folder through HTTP POST or GET requests directed at the router endpoints (e.g., `/create-follow-up-draft` or `/get-seen/:threadId/:messageId`).
2. **Transformations**: The requests are processed by extracting necessary user information and parameters from the incoming request. The router then queries the Supabase client to retrieve or manage email data.
3. **Data Exit**: After processing the requests, responses are generated that confirm actions taken (like draft creation) or return data (like visibility status), and are sent back to the client in JSON format.

## Key Patterns
- **Middleware for Authentication**: The consistent application of the `verifyToken` middleware across routes ensures protection of sensitive operations, securing access to email management features.
- **RESTful API Design**: The use of standard HTTP methods and endpoint structures for managing inbox interactions follow RESTful conventions, enhancing usability and clarity.
- **Dynamic Input Validation**: Input data is validated and processed to ensure correct formats and prevent errors during data handling.

---
## Relationship Map
### backend_researcher/router/inbox/draftRouter.js
```javascript
import express from "express";
import {
  configureOAuth,
  extractHtmlOrPlainText,
} from "../../services/googleServices.js";
import { makeReplyBody } from "../../services/googleServices.js";
import { makeBody } from "../../services/googleServices.js";

import { v4 as uuidv4 } from "uuid";
import { verifyToken } from "../../services/authServices.js";

const router = express.Router();

router.post(
  "/create-follow-up-draft/:professorId/:threadId",
  verifyToken,
  async (req, res) => {
    const { professorId, threadId } = req.params;
    const { professorName, professorEmail, fromName, fromEmail } = req.body;
    const userId = req.user.sub;

    const { data: draftData, error: draftFetchError } = await req.supabaseClient
      .from("Emails")
      .select("draft_id, tracking_id")
      .eq("user_id", userId)
      .eq("professor_id", professorId)
      .eq("type", "replydraft")
      .eq("sent", false)
      .single();

    if (draftData) {
      return res.status(400).json({ message: "Draft Already Exists" });
    }

    const gmail = await configureOAuth({
      userId,
      supabase: req.supabaseClient,
    });

    // Remaining logic...
  }
);
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/googleServices.js`** (multiple):
Target exports: decodeBody, configureOAuth, getDriveFileBuffer, extractHtmlOrPlainText, makeReplyBody, makeBody  
Target pagerank: 0.013758

**→ imports `uuid`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This CLAUDE.md documentation for the `backend_researcher/router/inbox/` folder provides a detailed overview of its purpose, functionality, data flow, and relationships within the overall architecture, ensuring a comprehensive understanding for developers working with this critical part of the application.