# CLAUDE.md for `backend_researcher/supabase/`

## Summary
The `supabase` folder is responsible for initializing and configuring the Supabase client used for authentication and data manipulation in the application. It primarily serves the purpose of logging in and registering users via Supabase's backend services.

## Key Files
- **supabase.js**: Sets up the Supabase client using environment variables for authentication and exports it for use in other parts of the application.

## Most Important Files by PageRank
- **supabase.js (pagerank: 0.018459)**: The only file in the folder, thus the most significant in terms of dependency and functionality.

## Key Relationships
- **Imports from**: 
  - `dotenv`: Loads environment variables for configuration.
  - `@supabase/supabase-js`: Supabase client library for connecting to the Supabase service.

- **Depends on**: This folder does not contain additional files that depend on it explicitly, but given its role, it is likely that other parts of the `backend_researcher` would import and utilize the `supabase` client for user authentication and data interactions.

## Architectural Patterns
The code exhibits a **configuration-based architecture** where environment variables are utilized to maintain sensitive information outside of the source code. The use of a configuration library (`dotenv`) allows for easy setup across different environments. Furthermore, utilizing a client's factory function (`createClient`) indicates a modular approach to integrating external services like Supabase, promoting separation of concerns for maintainability.