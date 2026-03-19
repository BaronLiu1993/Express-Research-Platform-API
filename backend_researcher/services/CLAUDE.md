# CLAUDE.md for `backend_researcher/services/`

## Summary
The `backend_researcher/services/` folder contains utility services that facilitate authentication and integration with Google APIs. It includes methods for token encryption, decryption, verification, and interaction with Google Drive and Gmail services, leveraging external libraries like OpenAI and Supabase for managing user data securely and efficiently.

## Key Files
- **authServices.js**: Contains functions to encrypt and decrypt tokens, verify JWTs, and generate OpenAI embeddings.
- **googleServices.js**: Provides functions for decoding token bodies, configuring OAuth for accessing Google services, and managing authentication tokens for user profiles.

## Most Important Files by PageRank
1. **authServices.js** (pagerank: 0.040691): Central to user authentication and security.
2. **googleServices.js** (pagerank: 0.013758): Handles Google API interactions and user OAuth configurations.

## Key Relationships
- **Imports:**
  - `authServices.js` imports: `openai`, `dotenv`, `jsonwebtoken`, `@supabase/supabase-js`, `crypto-js`.
  - `googleServices.js` imports: `authServices.js`, `googleapis`.
  
- **Dependencies:**
  - **Depends on** `backend_researcher/services/authServices.js` for functions like `encryptToken` and `decryptToken`.
  - **Is Dependable** by any components that require token verification or Google API services.

## Architectural Patterns
- **Service Pattern**: The folder adopts a service-oriented structure where specific functionalities are grouped into distinct service files, promoting modular design and reusability across the application.
- **Dependency Injection**: OAuth client and tokens are managed via dependency injection, allowing for dynamic configuration based on user profiles maintained in Supabase, leading to a clear separation of concerns.
- **Asynchronous Programming**: Use of `async/await` in service functions indicates a pattern for handling I/O operations with external services effectively, improving performance and maintainability.