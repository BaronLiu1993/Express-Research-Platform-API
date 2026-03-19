# CLAUDE.md for `backend_researcher/router/kanban/completed/`

## Summary
The `completed` folder contains the routing logic for handling completed tasks within a kanban board application. It provides API endpoints for retrieving, deleting, and managing completed tasks associated with users, leveraging Supabase for data retrieval and authentication mechanisms.

## Key Files
- **completedrouter.js**: Defines Express routes for fetching and deleting completed tasks and handles authorization via token verification.

## Most Important Files by PageRank
1. **completedrouter.js** (pagerank: 0.012353): The main router file that manages endpoints for completed Kanban tasks.

## Key Relationships
- **Imports**: 
  - `backend_researcher/supabase/supabase.js`: Supabase client for database interactions.
  - `express`: Framework used to create the router and define HTTP endpoints.
  - `backend_researcher/services/authServices.js`: Contains the `verifyToken` middleware for user authentication.

- **Depends On**: 
  - The routes in this folder depend on middleware for authentication and Supabase for data manipulation. Other components in the `router/kanban/` directory may call these endpoints to manage completed tasks.

## Architectural Patterns
- **MVC Pattern**: The routes serve as the controller layer, responding to HTTP requests and manipulating the data from the model (Supabase).
- **Route-based Architecture**: Each route is defined separately and handles specific functionalities related to completed tasks, facilitating separation of concerns and modularity.
- **Token-based Authentication**: Implements middleware to ensure that users are authenticated before performing operations on completed tasks, emphasizing security and user validation.