```markdown
# CLAUDE.md for `backend_researcher/router/storage/`

## Summary
The `backend_researcher/router/storage/` folder manages file uploads and retrievals, specifically handling user transcripts and resumes. It integrates with Google Drive for file storage and uses middleware for file validation, ensuring that only acceptable file types are processed.

## Key Files
- **storageMiddleware.js**: Defines middleware using `multer` to handle file uploads with restrictions on accepted file types.
- **storageRouter.js**: Sets up the Express router for file upload functionality, including endpoints to upload and retrieve file links for user profiles.

## Most Important Files by PageRank
1. **storageRouter.js** (PageRank: 0.008849) - Central to the routing functionality and OAuth configuration for file operations.
2. **storageMiddleware.js** (PageRank: 0.009648) - Implements file type filtering for uploads.

## Key Relationships
- **Imports from**:
  - `multer` (for file upload handling)
  - `express` (for defining routes)
  - `googleapis` (for interacting with Google Drive)
  - `dotenv` (for environment variable management)
  - `backend_researcher/services/authServices.js` (for user authentication)
  - `backend_researcher/services/googleServices.js` (for Google OAuth configuration)

- **Depends on**:
  - The router is crucial for HTTP requests that need to check authentication status via `verifyToken`, and for interacting with the Supabase client to manage user profile data.

## Architectural Patterns
- **Middleware Pattern**: Utilizes middleware (`storageMiddleware.js`) for handling file uploads with specific file type restrictions, ensuring modularity and separation of concerns.
- **Router Pattern**: Implements the Express router to manage diverse routes related to storage functionality, promoting clean routing and organization of endpoint logic.
- **Service-Oriented Architecture**: Integrates services (authentication and Google Drive interactions) that encapsulate complex behaviors, which enhances reusability and maintainability of the codebase.
```