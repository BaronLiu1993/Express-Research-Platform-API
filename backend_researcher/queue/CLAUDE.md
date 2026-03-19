# CLAUDE.md for `backend_researcher/queue/`

## Summary
The `backend_researcher/queue/` folder handles background job processing for sending emails, generating drafts, and sending follow-ups within the application. Using the BullMQ library in conjunction with Redis, it defines various job queues to manage asynchronous email operations, ensuring tasks are retried on failure and removed upon completion.

## Key Files
- **queueService.js**: Contains functions for generating draft emails and sending them, utilizing Google services and Mustache for templating.
- **draftQueue.js**: Defines a queue for generating email drafts, utilizing BullMQ with configurations for job handling.
- **followUpDraftQueue.js**: Queue for processing follow-up drafts after initial emails are sent.
- **followUpQueue.js**: Manages the queue for sending follow-up emails.
- **sendQueue.js**: Handles the queue for direct email sending.
- **draftWorker.js**: Worker that processes jobs from the draft queue, invoking methods from `queueService.js`.
- **followUpDraftWorker.js**: Worker for processing follow-up draft email jobs.
- **followUpWorker.js**: Worker responsible for sending follow-up emails.
- **sendWithAttachmentsQueue.js**: Manages additional jobs for sending emails with attachments.

## Most Important Files by PageRank
1. **queueService.js** (pagerank: 0.017342): Central to email generation and processing logic.
2. **draftQueue.js** (pagerank: 0.00748): Key entry point for generating email drafts.
3. **followUpDraftQueue.js** (pagerank: 0.00748): Essential for generating follow-up drafts.
4. **sendQueue.js** (pagerank: 0.00748): Critical for sending emails directly.

## Key Relationships
- **Imports from**: 
  - `backend_researcher/services/googleServices.js`: Provides key functions for Google service interactions.
  - `backend_researcher/redis/redis.js`: Supplies the Redis connection necessary for queue operations.
  
- **Depends on**:
  - Redis for managing job queues.
  - Google services for email-related functionality.
  - BullMQ for job queue management and worker processing.

## Architectural Patterns
- **Asynchronous Processing**: Utilizes job queues (BullMQ) for handling email sending and generation in a non-blocking manner.
- **Modular Service**: Separation of concerns where service logic (e.g., for Google service interactions) is abstracted into `queueService.js`, enabling maintainability and reusability.
- **Error Handling and Logging**: Each worker features comprehensive error handling and logging to facilitate monitoring and debugging, embodying robust architectural practices.