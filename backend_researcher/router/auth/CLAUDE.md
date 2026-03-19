# CLAUDE.md for backend_researcher/router/auth/

## Summary
The `auth` folder within the `backend_researcher/router` directory contains the routing logic for user authentication processes, specifically focusing on Google OAuth integration via the Supabase client. It handles user signup and signin flows, ensuring secure access to the application and related resources.

## Key Files
- **authrouter.js:** Main routing file that defines endpoints for Google OAuth user authentication, utilizing Supabase for session management.

## Most Important Files by PageRank
- **authrouter.js** (pagerank: 0.011307): This is the crucial routing file for managing authentication, leveraging third-party services like Google and Supabase for user identity management.

## Key Relationships
- **Imports:**
  - `supabase`: Provides authentication functionalities.
  - `express`: Framework for setting up routing.
  - `googleapis`: Used for Google OAuth client interactions.
  - `authServices.js`: Contains utility functions for token handling.
  - `dotenv`: Manages environment variables.
  
- **Depends on:**
  - The router is primarily utilized by the main backend application, specifically related to user authentication flows.

## Architectural Patterns
- **MVC Architecture:** The routing logic neatly separates concerns, with routes handling HTTP requests, the Supabase service managing database interactions, and potential services like `authServices.js` encapsulating authentication logic.
- **Middleware Utilization:** Express middleware patterns are followed for handling requests and integrating third-party services seamlessly into the authentication flow. 

This structured approach allows for clarity and scalability when introducing more authentication methods or extending existing logic.