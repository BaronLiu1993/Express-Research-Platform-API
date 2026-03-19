# CLAUDE.md for `backend_researcher/router/kanban/saved/`

## Summary
The `saved` folder within the `router/kanban` directory provides routes for managing saved items associated with user-specific professor IDs in a Kanban application. It handles requests to retrieve and add saved records related to professors, enforcing user authentication with a token verification process.

## Key Files
- **savedrouter.js**: Main router file that defines API endpoints for managing saved data related to professors, including fetching and adding saved items.

## Important Files by PageRank
- **savedrouter.js** (pagerank: 0.012353): The central file for routing requests related to saved professors, making it a critical component of the Kanban functionality.

## Key Relationships
- **Imports**:
  - `express`: Framework used for building the router and handling HTTP requests.
  - `backend_researcher/services/authServices.js`: Provides authentication middleware to verify user tokens before allowing access to the saved data routes.

- **Depends On**:
  - This router is dependent on the `authServices.js` for user verification and requires access to the `supabaseClient` for database operations related to "Saved" records.

## Architectural Patterns
- **MVC Pattern**: The structure suggests usage of the Model-View-Controller pattern, where this router acts as a controller layer managing API requests.
- **Token-based Authentication**: The use of the `verifyToken` middleware indicates a stateless authentication approach, enhancing security by making sure only authenticated users can access the saved data routes.
- **RESTful API**: The endpoints defined in `savedrouter.js` follow REST principles, utilizing standard HTTP methods (GET, POST) to interact with resources. 

This setup is integral to maintaining organized access and modifications for saved professor entries in alignment with user authentication protocols.