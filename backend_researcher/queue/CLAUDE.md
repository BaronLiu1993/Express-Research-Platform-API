# CLAUDE.md for the backend_researcher/queue/ Folder

## Purpose
The `backend_researcher/queue/` folder is responsible for managing background task processing using queues. It effectively organizes email-related tasks, such as sending emails, generating drafts, and sending follow-up emails, into separate queues that can be processed asynchronously. This structure allows the application to handle email operations without blocking the main execution thread, improving application responsiveness and performance.

If this folder were deleted, the application would lose all its queuing capabilities for managing background tasks, leading to failures in sending emails, generating drafts, and handling follow-up communications. Consequently, user interactions that depend on these functionalities would break.

## Files
### 1. backend_researcher/queue/queueService.js
- **What it does**: Contains the core logic for managing tasks related to email processing, such as generating drafts from snippets and handling follow-up emails. Coordinates with services to perform complete email operations.
- **Exports**: `generateDraftFromSnippetEmail`, `sendSnippetEmail`, `sendSnippetEmailWithAttachments`, `generateFollowUpDraftSnippetEmail`, `sendFollowUpEmail`, `sendFollowUpWithAttachments`
- **PageRank**: 0.017342
- **Why it matters**: This file serves as the business logic hub for queuing operations. It links user data to email actions, ensuring emails are generated and sent based on user triggers.

### 2. backend_researcher/queue/draftQueue.js
- **What it does**: Initializes a BullMQ queue for generating drafts of emails from snippets.
- **Exports**: `draftQueue`
- **PageRank**: 0.00748
- **Why it matters**: Essential for organizing the tasks associated with draft email generation, it allows the application to process multiple requests efficiently.

### 3. backend_researcher/queue/followUpDraftQueue.js
- **What it does**: Initializes a BullMQ queue specifically for processing tasks related to creating follow-up drafts of emails.
- **Exports**: `followUpDraftQueue`
- **PageRank**: 0.00748
- **Why it matters**: Provides a dedicated queue for follow-up drafts, ensuring these tasks are handled separately from other email processing tasks.

### 4. backend_researcher/queue/followUpQueue.js
- **What it does**: Sets up a queue for managing follow-up email tasks.
- **Exports**: `followUpQueue`
- **PageRank**: 0.00748
- **Why it matters**: Enables the application to track and process follow-up emails, enhancing user engagement capabilities.

### 5. backend_researcher/queue/followUpWithAttachmentsQueue.js
- **What it does**: Establishes a queue for managing follow-up email tasks that include attachments.
- **Exports**: `followUpWithAttachmentsQueue`
- **PageRank**: 0.00748
- **Why it matters**: Allows for specialized handling of emails with attachments during follow-up communications, ensuring all message types are supported.

### 6. backend_researcher/queue/sendQueue.js
- **What it does**: Initializes a queue for sending out standard email messages.
- **Exports**: `sendQueue`
- **PageRank**: 0.00748
- **Why it matters**: Core to the email sending functionality, enabling batch processing and efficient handling of outgoing email requests.

### 7. backend_researcher/queue/sendWithAttachmentsQueue.js
- **What it does**: Sets up a queue specifically for sending emails that contain attachments.
- **Exports**: `sendWithAttachmentsQueue`
- **PageRank**: 0.00748
- **Why it matters**: Ensures that emails with attachments can be processed separately, providing support for more complex message types.

### 8. backend_researcher/queue/draftWorker.js
- **What it does**: Implements a worker for the `generate-draft` queue, processing jobs that involve drafting emails.
- **Exports**: `draftWorker`
- **PageRank**: 0.006525
- **Why it matters**: Allows asynchronous processing of draft generation tasks, improving the speed and responsiveness of the email functionality.

### 9. backend_researcher/queue/followUpDraftWorker.js
- **What it does**: Implements a worker for the `follow-up-draft-email` queue to handle creating follow-up drafts.
- **Exports**: `followUpWorker`
- **PageRank**: 0.006525
- **Why it matters**: Ensures follow-up drafts are processed efficiently, allowing for responsive follow-up communication.

### 10. backend_researcher/queue/followUpWithAttachmentsWorker.js
- **What it does**: Implements a worker to manage tasks related to sending follow-up emails with attachments.
- **Exports**: `followUpWorkerWithAttachments`
- **PageRank**: 0.006525
- **Why it matters**: Allows the handling of complex follow-up communications, ensuring attachments can be sent seamlessly.

### 11. backend_researcher/queue/followUpWorker.js
- **What it does**: Implements a worker for processing jobs related to sending follow-up emails without attachments.
- **Exports**: `followUpWorker`
- **PageRank**: 0.006525
- **Why it matters**: Handles follow-up email processing efficiently, ensuring timely communication.

## Dependency Map
### For `backend_researcher/queue/queueService.js`
- **→ imports `uuid`**: 
  - **WHAT is imported**: A library to generate unique identifiers.
  - **WHY it’s needed**: To create unique tracking IDs for each email task.
  - **HOW it’s used**: Used in the `generateDraftFromSnippetEmail` function for tracking individual email operations.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: A library for managing environment variables.
  - **WHY it’s needed**: Ensures configurations like database credentials are securely managed.
  - **HOW it’s used**: Called to load environment variables before using any sensitive configurations.

- **→ imports `Mustache`**: 
  - **WHAT is imported**: A templating library.
  - **WHY it’s needed**: Enables dynamic content rendering within email messages.
  - **HOW it’s used**: Utilized in email body generation for rendering templates based on dynamic fields.

- **→ imports `backend_researcher/services/googleServices.js`** (multiple imports):
  - **WHAT is imported**: Several utility functions for handling email body composition and OAuth configuration.
  - **WHY it’s needed**: Essential for composing email messages and managing Google API authentication.
  - **HOW it’s used**: Functions like `makeBody`, `makeReplyBody`, and `configureOAuth` are utilized to prepare emails and configure OAuth settings.

- **→ imports `@supabase/supabase-js`**: 
  - **WHAT is imported**: Supabase client library.
  - **WHY it’s needed**: Facilitates interaction with the Supabase backend.
  - **HOW it’s used**: Used to create a client instance that queries user-related data during email processing.

### For Queue Files (e.g., `draftQueue.js`, `followUpDraftQueue.js`, etc.)
- **→ imports `backend_researcher/redis/redis.js`**: 
  - **WHAT is imported**: Connection instance for Redis.
  - **WHY it’s needed**: To initialize each queue with a connection to the Redis database for task management.
  - **HOW it’s used**: The connection is passed to the BullMQ queue configuration to enable background processing.

- **→ imports `bullmq`**: 
  - **WHAT is imported**: BullMQ library.
  - **WHY it’s needed**: To manage job queues in Redis efficiently.
  - **HOW it’s used**: Each queue is instantiated using the `Queue` class from BullMQ.

### For Worker Files (e.g., `draftWorker.js`, `followUpWorker.js`, etc.)
- **→ imports `backend_researcher/queue/queueService.js`**: 
  - **WHAT is imported**: Functions to generate drafts and handle follow-up emails.
  - **WHY it’s needed**: Provides the logic for what each worker should execute upon receiving a job from the queue.
  - **HOW it’s used**: Calls functions to perform the actual work defined by the queue jobs.

## Inbound Dependencies
Various router files and worker scripts rely on the functionality of the queue folder:
- **backend_researcher/router/send/sendRouter.js**: Utilizes multiple queues for managing outgoing email tasks.
- **backend_researcher/index.js**: Imports worker scripts to execute the processing jobs defined in the queues.
  
## Data Flow
1. **Data Entry**: Tasks (like sending emails) are added to their respective queues by router calls from user actions. Each task is managed as a job in the queue.
2. **Transformation**: Workers listen to these queues and process jobs as they arrive. Each worker will call methods from `queueService.js` to interact with the Google API and Supabase services, transforming the jobs into actual email actions.
3. **Data Exit**: Once a job is completed or if an error occurs, the worker logs the outcome and either creates a response for the user or stores results in Supabase.

## Key Patterns
- **Queue Management Pattern**: The use of BullMQ for managing background tasks allows for scalable, efficient processing of jobs, ensuring that the application remains responsive.
- **Separation of Concerns**: The architecture effectively separates the concerns of task management (in queues) from business logic (in service files), promoting cleaner, maintainable code.
- **Exponential Backoff Strategy**: The retry logic with exponential backoff configured on job retries ensures that transient issues do not lead to repeated immediate failures, improving resilience.

---
## Relationship Map
### backend_researcher/queue/queueService.js
```javascript
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Mustache from "mustache";
import { makeReplyBody } from "../services/googleServices.js";
import { makeBody } from "../services/googleServices.js";
import { extractHtmlOrPlainText } from "../services/googleServices.js";
import { createClient } from "@supabase/supabase-js";
import { configureOAuth } from "../services/googleServices.js";
import { getDriveFileBuffer } from "../services/googleServices.js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export async function generateDraftFromSnippetEmail({
  userId,
  professorId,
  body,
  accessToken,
}) {
  const { snippetId, dynamicFields, to, fromName, fromEmail, toName } = body;
  const trackingId = uuidv4();
  
  // Remaining logic...
}
```

**→ imports `uuid`**  
Target pagerank: 0.0

**→ imports `dotenv`**  
Target pagerank: 0.0

**→ imports `mustache`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/googleServices.js`**  
Target exports: decodeBody, configureOAuth, getDriveFileBuffer, extractHtmlOrPlainText, makeReplyBody, makeBody  
Target pagerank: 0.013758

**→ imports `backend_researcher/services/googleServices.js`**  
Target exports: decodeBody, configureOAuth, getDriveFileBuffer, extractHtmlOrPlainText, makeReplyBody, makeBody  
Target pagerank: 0.013758
  
**→ imports `@supabase/supabase-js`**  
Target pagerank: 0.0

### backend_researcher/queue/draftQueue.js
```javascript
import { Connection } from "../redis/redis.js";
import { Queue } from "bullmq";

const draftQueue = new Queue('generate-draft', {
  connection: Connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export default draftQueue;
```

**→ imports `backend_researcher/redis/redis.js`**  
Target pagerank: 0.041322

**→ imports `bullmq`**  
Target pagerank: 0.0

---

This comprehensive documentation of the `backend_researcher/queue/` folder details its purpose, files, dependencies, data flow, and design patterns, providing a valuable reference for developers working with email task management systems within the codebase.