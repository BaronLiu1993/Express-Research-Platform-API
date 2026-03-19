# CLAUDE.md for `backend_researcher/router/inbox/`

## Summary
The `inbox` folder provides routing functionalities for managing and interacting with email drafts and related messages through various endpoints. It integrates with Google's Gmail API to facilitate operations such as creating follow-up drafts, retrieving message data, and tracking email open statuses, while leveraging authentication mechanisms for secure access.

## Key Files
- **draftRouter.js**: Handles endpoints for creating follow-up email drafts based on user input and Gmail threads.
- **inboxrouter.js**: Manages routes for retrieving email data, including seen status and the complete email chain for specific threads.

## Most Important Files by PageRank
1. **inboxrouter.js** (pagerank: 0.008573) - Provides critical access to email data retrieval and interaction.
2. **draftRouter.js** (pagerank: 0.008849) - Important for managing the drafts functionality within the inbox context.

## Key Relationships
- **Imports**:
  - Both files import services from `backend_researcher/services/googleServices.js` and `backend_researcher/services/authServices.js` to handle Google APIs and authentication.
- **Dependencies**: 
  - Other components of the backend may rely on the functionalities provided by these routers to operate within the email context. For example, the services for handling email drafts and replies depend on this folder to manage user interactions.

## Architectural Patterns
- **Service Layer Pattern**: The folder makes use of a service-oriented architecture where distinct services (like `googleServices` and `authServices`) handle business logic, separating concerns from the route handling.
- **Routing Middleware**: The usage of Express routers demonstrates a modular approach to define routes for different email functionalities within the inbox, promoting maintainability and scalability of the codebase.