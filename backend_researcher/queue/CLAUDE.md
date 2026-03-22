# CLAUDE.md - Context Summary for Backend Researcher Queue

## Purpose
The **`backend_researcher/queue/`** folder is integral to the overall architecture of the Backend Researcher project, focusing on managing asynchronous tasks related to email drafting and sending. It leverages `bullmq` for job handling and Redis for queuing, ensuring that email interactions (such as draft creations and follow-ups) are processed in a non-blocking manner. If this folder were to be deleted, the functionalities for handling email drafts and queued email interactions would break, leading to user requests not being fulfilled, ultimately disrupting the user's experience.

This module fits into the architecture by acting as a service layer that interacts directly with the Redis service for job queuing, ensuring that the email-related tasks are performed efficiently without blocking the main application workflow.

## Files

### 1. queueService.js
- **What it does:** This file encapsulates functions for generating email drafts and managing interactions with Supabase and Google’s Gmail API. It creates drafts using provided snippets, dynamic fields, and user details.
- **Exports:** Exports functions like `generateDraftFromSnippetEmail`, `sendSnippetEmail`, and others related to email operations.
- **PageRank:** 0.017342
- **Why it matters:** Central to the email drafting and sending logic, it integrates multiple services to create cohesive email workflows.

### 2. draftQueue.js
- **What it does:** Defines a queue specifically for generating drafts using `bullmq` and connects to Redis.
- **Exports:** The `draftQueue` instance.
- **PageRank:** 0.00748
- **Why it matters:** This queue is crucial for storing and managing jobs related to draft email creations that can be processed asynchronously.

### 3. followUpDraftQueue.js
- **What it does:** Similar to `draftQueue.js`, this file defines a queue specifically for follow-up draft emails.
- **Exports:** The `followUpDraftQueue` instance.
- **PageRank:** 0.00748
- **Why it matters:** It maintains tasks for follow-up emails, ensuring they are queued and processed effectively.

### 4. followUpQueue.js
- **What it does:** Establishes a queue for sending follow-up emails.
- **Exports:** The `followUpQueue` instance.
- **PageRank:** 0.00748
- **Why it matters:** It handles job management for follow-up emails, ensuring these tasks are executed in an orderly fashion.

### 5. followUpWithAttachmentsQueue.js
- **What it does:** Configures a queue for handling follow-up emails that include attachments.
- **Exports:** The `followUpWithAttachmentsQueue` instance.
- **PageRank:** 0.00748
- **Why it matters:** It ensures that tasks involving attachments are processed correctly alongside follow-up emails.

### 6. sendQueue.js
- **What it does:** Sets up a queue for sending regular emails.
- **Exports:** The `sendQueue` instance.
- **PageRank:** 0.00748
- **Why it matters:** It is crucial for managing the workflow of sending out emails asynchronously.

### 7. sendWithAttachmentsQueue.js
- **What it does:** Defines a queue for sending emails that include attachments.
- **Exports:** The `sendWithAttachmentsQueue` instance.
- **PageRank:** 0.00748
- **Why it matters:** Similar to the other queues, it ensures attachment-handling emails are processed seamlessly.

### 8. draftWorker.js
- **What it does:** Initializes a worker that processes jobs from the `draftQueue`, using the service functions defined in `queueService.js` to generate email drafts.
- **Exports:** The `draftWorker` instance.
- **PageRank:** 0.006525
- **Why it matters:** Critical for executing asynchronous email draft jobs, providing logging for job statuses.

### 9. followUpDraftWorker.js
- **What it does:** Sets up a worker specifically for the follow-up drafts queue, processing jobs that generate follow-up email drafts.
- **Exports:** The `followUpWorker` instance.
- **PageRank:** 0.006525
- **Why it matters:** Facilitates the creation of follow-up drafts, essential for maintaining user communications.

### 10. sendWithAttachmentsWorker.js
- **What it does:** Worker that processes jobs for sending emails with attachments.
- **Exports:** The `sendWithAttachmentsWorker` instance.
- **PageRank:** 0.006525
- **Why it matters:** Ensures that sending emails with attachments operates smoothly without blocking other processes.

### 11. sendWorker.js
- **What it does:** Configures a worker for processing standard email sending jobs.
- **Exports:** The `sendWorker` instance.
- **PageRank:** 0.006525
- **Why it matters:** Handles regular email sending tasks, thus necessary for user email functionalities.

## Dependency Map

### 1. Imports in `queueService.js`
- **`uuid`**: Generates unique identifiers for tracking purposes in email drafts.
- **`dotenv`**: Loads configuration variables for database connections and API keys.
- **`mustache`**: Used for templating email contents with dynamic values from snippets.
- **`@supabase/supabase-js`**: Connects to Supabase for handling database operations regarding email snippets.
- **`googleapis`**: Used to interface with Google’s Gmail API for creating and managing drafts.

### 2. Imports in `draftQueue.js`, `followUpDraftQueue.js`, `followUpQueue.js`, `followUpWithAttachmentsQueue.js`, `sendQueue.js`, and `sendWithAttachmentsQueue.js`
- **`Connection` from `../redis/redis.js`**: Provides connection settings for the Redis-based job queue.
- **`bullmq`**: Drives the handling of job queues.

### 3. Imports in workers (`draftWorker.js`, `followUpDraftWorker.js`, `sendWorker.js`, `sendWithAttachmentsWorker.js`)
- **`Worker` from `bullmq`**: Class responsible for handling jobs in the respective queues.
- **Service functions from `queueService.js`**: Invokes methods for generating drafts or sending emails.
- **`Connection` from `../redis/redis.js`**: Ensures workers can connect to Redis for job management.

## Inbound Dependencies
The following files outside of the queue folder depend on this module:
- **backend_researcher/router/send/sendRouter.js**: Makes extensive use of all the queue files for handling email-related requests.
- **backend_researcher/index.js**: Uses worker instances to initialize all necessary email processing services.

## Data Flow

1. **Data Entry**: User triggers an email-related action through an API endpoint defined in the router (e.g., creating a draft).
2. **Queue Management**: Based on the action, jobs are pushed to respective queues (like `draftQueue`, `sendQueue`, etc.).
3. **Job Processing**: Workers listen to their respective queues, pulling jobs and executing necessary logic defined in `queueService.js`.
4. **External Service Interaction**: Email jobs may involve contacting external services (e.g., Supabase, Gmail API) to fetch data or perform actions.
5. **Data Exit**: Outcomes (success or error) are logged, and the API responds to the user with the results.

## Key Patterns
- **Job Queuing Pattern**: Utilizes `bullmq` queues for managing asynchronous tasks, ensuring responsiveness and performance during high loads.
- **Service Oriented Architecture**: Each queue and worker serves a specific purpose, reflecting adherence to single responsibility principles.
- **Event Handling**: Implementation of event listeners for job status updates promoting real-time logging and debugging.
- **Separation of Concerns**: Each file has a distinct role (e.g., queues for job structure, workers for execution), enhancing maintainability.

By following these guidelines, developers and maintainers of the Backend Researcher project can easily understand and work within the `queue` module, ensuring efficient email draft and sending processes.