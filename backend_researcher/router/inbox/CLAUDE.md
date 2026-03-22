# CLAUDE.md - Context for backend_researcher/router/inbox/

## Purpose
The **inbox folder** under `backend_researcher/router/` is crucial for handling email-related operations specifically revolving around user interactions within their inboxes. It provides dedicated routes to create follow-up drafts, fetch email metadata, and retrieve complete email thread chains. If this folder or its contents were deleted, the application would lose its capability to manage these email interactions effectively, hampering user experience and significantly limiting the email processing functionalities of the system. This folder fits within the broader architecture as a part of the routing layer that communicates with the services layer to perform necessary actions based on user requests.

## Files

### 1. draftRouter.js
- **What it does**: This file defines routes for creating follow-up drafts for emails. The main endpoint, `/create-follow-up-draft/:professorId/:threadId`, processes HTTP POST requests to create and store an email draft based on existing email threads and user inputs.
- **Exports**: `router`
- **PageRank**: 0.008849
- **Why it matters**: It allows users to generate personalized email drafts efficiently, leveraging existing email threads, which is central to the main functionalities of the Backend Researcher Project.

### 2. inboxrouter.js
- **What it does**: This file manages two routes for retrieving email-related data. The `/get-seen/:threadId/:messageId` endpoint checks if a specific email within a thread has been opened, while the `/get-full-email-chain/:threadId` fetches the entire email thread.
- **Exports**: `router`
- **PageRank**: 0.008573
- **Why it matters**: By providing access to crucial email metadata and full threads, it enhances the user's ability to track communication, which is essential for effective research correspondence.

## Dependency Map

### draftRouter.js
- **express** → The `express` module is imported to create an instance of the router for handling HTTP requests. Express is needed to structure the web application and handle routing efficiently.
- **googleServices.js** → Functions like `configureOAuth`, `makeReplyBody`, and `extractHtmlOrPlainText` are imported to manage OAuth configurations and construct email drafts. This is essential for interacting with the Gmail API.
- **uuid** → Imported to generate a unique tracking ID for each draft created. This uniqueness is necessary to manage drafts independently.
- **authServices.js** → The `verifyToken` function is used to ensure that only authenticated users can access the endpoint to create drafts. Security is vital to protect user data.

### inboxrouter.js
- **googleapis** → Used to connect with Google services, specifically to interact with Gmail for retrieving email data and ensuring OAuth is set up properly.
- **express** → Similar to `draftRouter.js`, it facilitates the routing of HTTP requests.
- **dotenv** → Loads environment variables required for service configurations, such as OAuth credentials.
- **email-reply-parser** → While not used in the provided code snippets, it suggests functionality related to parsing email content which could be used for replying or analyzing threads.
- **mailparser** → Expected to assist in parsing email messages for further operations, ensuring that the email content is correctly handled.

## Inbound Dependencies
- **backend_researcher/index.js** imports both `draftRouter.js` and `inboxrouter.js`, tying the functionalities to the main application and enabling the relevant routes to be accessible to the frontend.

## Data Flow
1. **Input**: The user initiates an HTTP request (either to create a draft or fetch email data).
2. **Router**: The specific router (either `draftRouter.js` or `inboxrouter.js`) processes this request.
3. **Service Layer**: The router communicates with the services provided in `googleServices.js` and `authServices.js` to perform actions like configuring OAuth and fetching or generating email content.
4. **Database Interactions**: For operations involving Supabase, the relevant database queries are executed to retrieve or insert email data, ensuring that all actions are logged and user information is managed safely.
5. **Output**: Depending on the operation, the router responds with the appropriate data (e.g., confirmation of draft creation or metadata about seen emails).

## Key Patterns
- ** Route-based Organization**: Each file acts as a modular router for different functionalities, increasing maintainability and scalability.
- **Middleware Usage**: `verifyToken` is leveraged as middleware in routes to ensure that sensitive operations are only performed by authenticated users.
- **Promisified Asynchronous Handling**: The code consistently utilizes async/await for dealing with asynchronous operations like database calls and API requests, enhancing readability and error handling.

This documentation provides a detailed overview of the `backend_researcher/router/inbox/` folder, ensuring that future developers can understand its structure, functions, and integration within the Backend Researcher Project's larger ecosystem.