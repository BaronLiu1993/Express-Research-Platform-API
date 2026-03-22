# CLAUDE.md - Documentation for `backend_researcher/router/kanban/inProgress/`

## Purpose
The **inProgress** folder within the **kanban** router serves as an endpoint for managing the Kanban board's "In Progress" section in the Backend Researcher application. This folder contains routes that handle fetching user-specific data related to ongoing projects, including professor IDs and email drafts. If this folder were to be deleted, the application would lose critical functionality concerning the retrieval and display of "In Progress" tasks, which would hinder user productivity and project management.

This subfolder fits into the broader architecture of the application by acting as an intermediary that connects user requests to the underlying data layers, specifically interfacing with Supabase to retrieve necessary data based on user identification.

## Files

### 1. `inProgressRouter.js`
- **What it does**: This file defines the router for all "in progress" related API endpoints. It utilizes the Express framework to set up routes that respond to user requests for fetching applied professors and ongoing tasks from the database.
- **Exports**: Exports an instance of the Express router configured with various GET routes.
- **PageRank**: 0.012629
- **Why it matters**: Central to the retrieval of important user data that supports the Kanban board's functionality, allowing users to see which tasks are currently active and associated professors.

### 2. `inProgressRouter.js` Routes
- **`GET /repository/get-all-appliedId`**: Fetches IDs of professors who the user has applied to. If professors cannot be fetched, it returns a 400 status with an error message.
- **`GET /kanban/get-in-progress`**: Retrieves all ongoing tasks for the user, offering pagination by limiting results. Returns a 400 status if the data fetch fails.
- **`GET /fetch/draft`**: Fetches drafts associated with ongoing emails, aggregating professor details based on IDs. Returns comprehensive draft data or a 400 status on error.

## Dependency Map

### 1. **Imports within `inProgressRouter.js`**
- **`express`** → **`router`**: The Express library is needed to create the router instance and manage HTTP requests effortlessly.
- **`../../../services/authServices.js`** → **`verifyToken`**: This function is crucial for validating user tokens before accessing sensitive data, ensuring that only authenticated users can access their information.

### 2. **Supabase Client Usage**
- The file relies heavily on `req.supabaseClient`, which is initialized elsewhere, presumably in a middleware, to interact with the Supabase database. This client is necessary for executing queries to fetch professor IDs and email drafts from user-specific tables like "InProgress" and "Emails."

## Inbound Dependencies
- **`backend_researcher/index.js`**: Imports `inProgressRouter.js` to connect this router into the main application routing, making its endpoints accessible via the API.

## Data Flow
1. **Incoming Requests**: The router receives incoming HTTP GET requests for specific endpoints related to the Kanban board.
2. **Token Verification**: Each request passes through the `verifyToken` middleware to ensure the requester is authenticated. If verification fails, an error response is sent.
3. **Database Queries**: Upon successful verification, the router queries the Supabase database for data (professor IDs or email drafts) pertaining to the authenticated user.
4. **Response Handling**: Finally, the router sends back a JSON response with either the requested data or an error message based on the results of database queries.

## Key Patterns
- **Middleware for Security**: The usage of the `verifyToken` middleware highlights a common security pattern where authentication is systematically required for route access.
- **Modularity and Separation of Concerns**: The router file cleanly separates the routing logic from the business logic by relying on `authServices.js` for token verification and Supabase for data retrieval.
- **Error Handling**: Consistent error handling across endpoints that send clear JSON messages makes the API user-friendly and easy to debug.

This documentation intends to provide clarity on the purpose and functionality of the inProgress router, making it easier for developers to understand its role within the larger architecture of the Backend Researcher application.