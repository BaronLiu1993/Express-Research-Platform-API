# CLAUDE.md - Context for `backend_researcher/router/send/`

## Purpose
The `backend_researcher/router/send/` folder is dedicated to handling HTTP requests related to sending emails and creating follow-up drafts in bulk. It functions as a vital point in the backend architecture, interfacing with both the client and the business logic contained within services and queues. Deleting this folder would disrupt the application's ability to process email drafts and trigger sending tasks, undermining significant functionality such as bulk communication, follow-ups, and managing email attachments. It is integral to the overall system’s architecture, connecting the frontend requests to the necessary processing tasks handled by the queues.

## Files

### 1. `sendRouter.js`
- **What It Does**: Exposes routes to facilitate sending follow-up emails and generating drafts based on professor data provided by the client. It utilizes various queues for different tasks related to email sending and follows best practices by verifying user tokens for authorization.
- **Exports**: An Express router instance configured with specific POST routes.
- **PageRank**: 0.011582 (relatively high, indicating critical linkage and usage).
- **Why It Matters**: Serves as a gateway for sending emails and managing drafts. Ensures that the system complies with user authentication and authorization before proceeding with any email operations.

## Dependency Map

### In the Router (`sendRouter.js`):
- `sendRouter.js` → `draftQueue`: The router uses `draftQueue` to handle bulk queuing of email drafts.
- `sendRouter.js` → `sendQueue`: Although not directly invoked in the snippets provided, this queue is intended for sending emails.
- `sendRouter.js` → `sendWithAttachmentsQueue`: The router employs this queue when sending emails that need attachments.
- `sendRouter.js` → `followUpDraftQueue`: Utilized for queuing follow-up drafts in bulk.
- `sendRouter.js` → `followUpQueue`: A queue for managing follow-up email jobs.
- `sendRouter.js` → `followUpWithAttachmentsQueue`: Handles emails that include attachments in follow-ups.
- `sendRouter.js` → `authServices.js`: Required for verifying user tokens to ensure that only authenticated users can access the routes.

### Detailed Explanation:
- **draftQueue**: Manages the queuing of email drafts.
- **sendQueue**: Intended for sending emails, providing a robust messaging service.
- **sendWithAttachmentsQueue**: Allows sending of emails that include attachments, handling the complexity of the communication process.
- **followUpDraftQueue**: Enables efficient management of bulk drafts tailored specifically for follow-ups.
- **followUpQueue**: A queue dedicated to sending out follow-up emails.
- **followUpWithAttachmentsQueue**: Manages sending follow-ups that also include attachments for better user engagement.
- **authServices.js**: Provides token verification to ensure security compliance and user identity confirmation when accessing email functionalities.

## Inbound Dependencies
- **`backend_researcher/index.js`**: This main entry point file imports `sendRouter.js`, utilizing the defined routes to handle incoming requests effectively. 

## Data Flow
1. **Incoming Request**: The router listens for POST requests directed at various endpoints (e.g., `/snippet-create-followup-draft`).
2. **Token Verification**: Before processing the request, the `verifyToken` middleware checks the user's token to ensure proper authentication.
3. **Job Creation**: Upon successful verification, the necessary data (e.g., `professorData`, body templates) is extracted from the request's payload to create jobs.
4. **Bulk Queuing**: The router maps over the `professorData` to create an array of job objects, which are then bulk added to the appropriate queue (like `followUpDraftQueue` or `followUpWithAttachmentsQueue`).
5. **Response Handling**: After queuing jobs, the router sends back an appropriate HTTP response indicating success or failure.

## Key Patterns
- **Middleware Usage**: The use of `verifyToken` middleware is a prominent pattern that enhances security by ensuring that only authenticated requests are processed.
- **Bulk Processing**: The implementation of adding multiple jobs to the queues in bulk helps in efficiently processing multiple requests simultaneously, adhering to the single-responsibility principle.
- **Error Handling**: Well-structured try/catch blocks around asynchronous operations allow robust error handling and improved user feedback.

This detailed overview equips anyone diving into the `backend_researcher/router/send/` folder with the context necessary to understand its crucial role within the larger application architecture.