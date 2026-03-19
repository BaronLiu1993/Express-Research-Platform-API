# CLAUDE.md for the backend_researcher/router/send/ Folder

## Purpose
The `backend_researcher/router/send/` folder is dedicated to handling routes related to sending emails and managing email drafts within the application. This includes functionalities such as queuing tasks for sending follow-up emails and drafts, facilitating bulk email operations, and managing the associated background processing through queue management. 

If this folder were deleted, the application would lose all capabilities related to sending emails, processing drafts, and managing follow-ups, significantly impacting user interactions and engagement. Users would be unable to communicate effectively via email, hindering the overall purpose of the application as an academic engagement tool.

## Files
### 1. backend_researcher/router/send/sendRouter.js
- **What it does**: Defines API endpoints for tasks such as creating follow-up drafts, sending emails, and managing email attachments. It utilizes various queues to handle these asynchronous operations effectively.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.011582
- **Why it matters**: This file is essential for enabling users to perform email-related actions swiftly, utilizing background job processing and allowing for effective communication management.

## Dependency Map
### For `backend_researcher/router/send/sendRouter.js`
- **→ imports `draftQueue`**: 
  - **WHAT is imported**: Queue specifically for managing draft email tasks.
  - **WHY it’s needed**: To handle bulk operations for follow-up draft creation efficiently.
  - **HOW it’s used**: The queue is used to add draft jobs that will be processed asynchronously.

- **→ imports `sendQueue`**: 
  - **WHAT is imported**: Queue for managing standard email sending tasks.
  - **WHY it’s needed**: To facilitate sending emails without blocking the main application thread.
  - **HOW it’s used**: Allows jobs associated with sending emails to be queued and processed in the background.

- **→ imports `sendWithAttachmentsQueue`**: 
  - **WHAT is imported**: Queue for managing sending emails with attachments.
  - **WHY it’s needed**: To handle sending emails that have additional files attached seamlessly.
  - **HOW it’s used**: Enables asynchronous processing of email sending tasks that include attachments.

- **→ imports `followUpDraftQueue`**: 
  - **WHAT is imported**: Queue for managing follow-up draft email tasks.
  - **WHY it’s needed**: To efficiently create follow-up drafts asynchronously.
  - **HOW it’s used**: Enqueues jobs for generating follow-up drafts when users request them.

- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create a router instance and define the API routes for sending email functionality.
  - **HOW it’s used**: The `express.Router()` method creates the router for managing send-related API paths.

- **→ imports `followUpQueue`**: 
  - **WHAT is imported**: Queue for managing standard follow-up email tasks.
  - **WHY it’s needed**: To process follow-up emails efficiently without blocking the main application.
  - **HOW it’s used**: Utilized to enqueue tasks related to sending follow-up emails.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: The `verifyToken` function.
  - **WHY it’s needed**: To secure routes by verifying user authentication before allowing access to email sending functionalities.
  - **HOW it’s used**: The `verifyToken` middleware is applied to the route handlers, ensuring user requests are authenticated.

## Inbound Dependencies
- **backend_researcher/index.js**: This main entry point imports `sendRouter.js` to enable the application's overall routing structure, providing access to all email-related routes from within the API.

## Data Flow
1. **Data Entry**: Data enters the router through POST requests to the defined endpoints, such as `/snippet-create-followup-draft` or `/mass-send-followup`.
2. **Transformations**: The router takes incoming data, including professor details and email content, processes it to prepare background tasks, and enqueues these tasks into the respective queues for processing.
3. **Data Exit**: Once the background tasks are processed, feedback is sent back to the user through JSON responses, confirming the queuing of tasks or reporting any errors encountered during operations.

## Key Patterns
- **Queue Management Pattern**: The router utilizes multiple queues for managing background tasks related to sending emails and generating drafts. This allows the application to remain performant while handling asynchronous operations efficiently.
- **Middleware for Authentication**: Consistent implementation of `verifyToken` ensures that sensitive actions requiring user authentication are protected, following best practices for securing API endpoints.
- **RESTful Routing Design**: The router structure adheres to RESTful API design principles, utilizing appropriate HTTP methods and clear endpoint paths for managing email operations, improving usability and organization.

---
## Relationship Map
### backend_researcher/router/send/sendRouter.js
```javascript
import draftQueue from "../../queue/draftQueue.js";
import sendQueue from "../../queue/sendQueue.js";
import sendWithAttachmentsQueue from "../../queue/sendWithAttachmentsQueue.js";
import followUpDraftQueue from "../../queue/followUpDraftQueue.js";
import express from "express";
import followUpQueue from "../../queue/followUpQueue.js";
import followUpWithAttachmentsQueue from "../../queue/followUpWithAttachmentsQueue.js";
import { verifyToken } from "../../services/authServices.js";

const router = express.Router();

router.post("/snippet-create-followup-draft", verifyToken, async (req, res) => {
  const { professorData, baseBody } = req.body;
  const userId = req.user.sub;

  try {
    const jobs = professorData.map((professor) => ({
      name: "follow-up-draft-email",
      data: {
        userId,
        professorId: professor.id,
        accessToken: req.token,
        body: {
          ...baseBody,
          dynamicFields: professor.dynamicFields,
          to: professor.email,
        },
      },
    }));
    await followUpDraftQueue.addBulk(jobs);
    res.status(200).json({ message: "Bulk emails queued", count: jobs.length });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Failed to queue bulk emails" });
  }
});

// Additional routes...
```

**→ imports `backend_researcher/queue/draftQueue.js`**  
Target pagerank: 0.00748

**→ imports `backend_researcher/queue/sendQueue.js`**  
Target pagerank: 0.00748

**→ imports `backend_researcher/queue/sendWithAttachmentsQueue.js`**  
Target pagerank: 0.00748

**→ imports `backend_researcher/queue/followUpDraftQueue.js`**  
Target pagerank: 0.00748

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `backend_researcher/queue/followUpQueue.js`**  
Target pagerank: 0.00748

**→ imports `backend_researcher/queue/followUpWithAttachmentsQueue.js`**  
Target pagerank: 0.00748

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This CLAUDE.md documentation of the `backend_researcher/router/send/` folder elucidates its purpose, functionality, data flow, and relationships, providing a comprehensive understanding for developers interacting with this critical component of the application.