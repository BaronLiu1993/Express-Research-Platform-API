# CLAUDE.md for `backend_researcher/router/kanban/inProgress/`

## Summary
The `backend_researcher/router/kanban/inProgress/` folder contains route definitions specifically for managing and retrieving Kanban board items that are marked as in-progress for users. It provides endpoints to access data relevant to the current user's work items and drafts, enforcing authentication through token verification.

## Key Files
- **inProgressRouter.js**: Defines routes for interacting with in-progress Kanban items, including fetching applied IDs and in-progress data from the Supabase database.

## Important Files by PageRank
1. **inProgressRouter.js** (pagerank: 0.012629): Central to the functionality of retrieving in-progress Kanban data based on user authentication.
  
## Key Relationships
- **Imports**:
  - Imports the `express` framework for routing.
  - Imports `verifyToken` from `../../../services/authServices.js` to enforce user authentication on the routes.

- **Dependencies**:
  - This router relies on the Supabase client to fetch data from the "InProgress" and "Emails" tables.
  - Routes from this folder are likely called by a centralized router defined in `backend_researcher/router/`.

## Architectural Patterns
- **Router Middleware**: Utilizes Express.js routing to separate concerns, providing a modular approach to handling API requests for in-progress Kanban items.
- **Token-Based Authentication**: Implements middleware to verify user tokens, ensuring secure access to the routes.
- **Asynchronous Data Fetching**: Uses async/await syntax for handling asynchronous calls to the Supabase client, promoting cleaner and more readable code for database interactions.