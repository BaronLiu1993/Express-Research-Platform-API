# CLAUDE.md for `backend_researcher/router/grants/`

## Summary
The `backend_researcher/router/grants/` folder defines the routing logic for managing grants in the application. It primarily handles endpoints related to fetching grant data and utilizes token verification for access control. This section of the codebase facilitates interactions with the Supabase database to retrieve grant information.

## Key Files
- **grantRouter.js**: The main router for grant-related requests, featuring middleware for token verification and logic to fetch grants from the Supabase database.

## Important Files by PageRank
1. **grantRouter.js** (pagerank: 0.011582): The central routing file for grant operations, relying on the `authServices.js` for authentication checks.

## Key Relationships
- **Imports:**
  - `authServices.js`: Provides the `verifyToken` middleware for securing routes.
  - `express`: A web framework used to create the router.
  
- **Depends On:**
  - Services for authentication (`authServices.js`) and database interactions (Supabase client).

## Architectural Patterns
- **Middleware Pattern**: The use of `verifyToken` as middleware ensures that only authenticated users can access the grant data routes.
- **Router Pattern**: Uses the Express Router to separate route definitions logically, enhancing modularity and maintainability within the routing structure of the application.

This folder is integral to managing grant information securely and efficiently within the backend architecture of the application.