# CLAUDE.md for backend_researcher/router/send/

## Summary
The `send` folder contains the routing logic for handling email-related requests in the backend system. It facilitates the creation and queuing of follow-up emails, including those with attachments, leveraging multiple queue services to manage jobs for bulk processing of emails effectively while ensuring user authentication through token verification.

## Key Files
- **sendRouter.js**: Defines routes for sending follow-up emails and queuing email jobs based on user requests.

## Important Files by PageRank
- **sendRouter.js** (pagerank: 0.011582): The main routing file that manages email sending functionalities by integrating various queue services.

## Key Relationships
- **Imports:**
  - `backend_researcher/queue/draftQueue.js`: Queue for managing draft emails.
  - `backend_researcher/queue/sendQueue.js`: Queue for handling sending of emails.
  - `backend_researcher/queue/sendWithAttachmentsQueue.js`: Queue for sending emails that include attachments.
  - `backend_researcher/queue/followUpDraftQueue.js`: Queue specifically for follow-up draft emails.
  - `backend_researcher/queue/followUpQueue.js`: Queue for processing regular follow-up emails.
  - `backend_researcher/queue/followUpWithAttachmentsQueue.js`: Queue for follow-up emails that require attachments.
  - `backend_researcher/services/authServices.js`: Service for verifying user tokens and managing authentication.

- **Depends On:**
  - This router is a critical dependency for any services or parts of the application that handle email communications and follow-ups.

## Architectural Patterns
- **Microservices Architecture**: The email sending process is organized into distinct services (queues) for different job types (drafts, follows up, with/without attachments), promoting separation of concerns and better scalability.
- **Middleware Pattern**: Utilizes middleware (`verifyToken`) to handle authentication before executing route handlers, enhancing security by ensuring that only authorized users can access email functionalities.