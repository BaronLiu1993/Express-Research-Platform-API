# CLAUDE.md for `backend_researcher/router/snippets/`

## Purpose
The `snippets` folder within `backend_researcher/router/` handles HTTP routing specifically for managing snippets of email templates or text blocks. This folder is crucial for the functionality around saving, modifying, and retrieving snippets that users create or utilize within the system. If this folder and its corresponding files were deleted, users would lose the ability to insert and synchronize snippets, significantly hampering their ability to manage email content effectively. The directory directly connects with the service layer for data manipulation through Supabase, while also enforcing user authentication via token verification.

## Files

### 1. `snippetsRouter.js`
- **What it does**: This file defines the `snippetsRouter`, which contains endpoints for inserting new snippets and fetching variables associated with users. It handles incoming requests, processes data, and interacts with the Supabase database to persist snippets.
- **Exports**: It exports the configured router instance, making it available for import and use in other parts of the application.
- **PageRank**: 0.011582
- **Why it matters**: This router acts as a critical interface between the client requests and backend operations, allowing for a structured method to manage snippets which are essential for users' email automation and management tasks.

## Dependency Map

### In `snippetsRouter.js`

**Express Import**
- **`import express from "express";`**
  - **What is imported**: The Express.js framework, which provides the routing and middleware functions to handle HTTP requests.
  - **Why it's needed**: Essential for creating the router and defining the RESTful endpoint structures.
  - **How it's used**: Initializes and exports an Express router to define routes for managing snippets.

**Auth Services Import**
- **`import { verifyToken } from "../../services/authServices.js";`**
  - **What is imported**: The `verifyToken` function, used for validating JWT tokens for authenticated user requests.
  - **Why it's needed**: Security measure to ensure that only authenticated users can interact with the snippets endpoints.
  - **How it's used**: Applied as middleware to route handlers to ensure requests have valid authentication tokens.

### 2. Data Flows
1. **Request Initiation**: Data enters this folder through HTTP POST requests sent to the `/insert` and `/sync-fetchable-variables` routes.
2. **Data Processing**:
   - For snippet insertion, the raw HTML and subject are taken from the request body, then processed to remove any placeholder syntax using `cleanSnippetPlaceholders`.
   - Variable synchronization processes incoming arrays to ensure valid input and prepares them for external operations.
3. **Database Interaction**:
   - Inserts and queries directed at the Supabase service to persist snippets and fetch necessary supplementary data (like user specific variables).
   - Returns results as JSON responses indicating success or error status.
4. **Response**: The router returns appropriate status codes and messages to the client based on the results of the operations.

## Inbound Dependencies
### External Connections
- **`backend_researcher/index.js`**: This main file imports `snippetsRouter.js` to incorporate snippet management into the overall routing structure of the backend API. It initiates the server and makes the snippet functionalities available for client access.

## Key Patterns
- **RESTful Routing**: The router follows REST principles by organizing endpoint URLs around resource actions (e.g., `POST /insert` for creating snippets).
- **Middleware for Security**: The router employs middleware (`verifyToken`) to enforce authentication, ensuring secure access to routes.
- **Asynchronous Calls**: Utilizes asynchronous functions for handling database operations, allowing non-blocking behavior and efficient request handling.

By documenting the `snippets` router thoroughly, we ensure that developers and team members have clarity on its purpose, functionalities, and interactions within the broader backend architecture, facilitating better understanding and contributions to the codebase.