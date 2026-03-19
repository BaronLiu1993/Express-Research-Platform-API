# CLAUDE.md for `backend_researcher/router/repository/`

## Summary
The `repository` folder within the `backend_researcher/router/` structure is responsible for managing routes related to the Taishan research database. It provides endpoints to filter and retrieve research data based on various criteria, utilizing OpenAI's capabilities for enhanced data processing and authentication services to secure access.

## Key Files
- **repositoryRouter.js**: Defines the router for managing requests related to the Taishan database, including filtering and pagination functionalities.

## Most Important Files by PageRank
- **repositoryRouter.js (pagerank: 0.011582)**: The primary file handling data routes for the Taishan database.

## Key Relationships
### Imports
- `express`: Framework for building web applications in Node.js.
- `OpenAI`: Interface for utilizing OpenAI's functionalities.
- `dotenv`: Facilitates environment variable management.
- `verifyToken` from `backend_researcher/services/authServices.js`: Middleware for authenticating requests.

### Dependencies
- Dependent on: `services/authServices.js` for authentication utilities.
- May have calls from other router files or services that require access to academic research data.

## Architectural Patterns
- **Router Pattern**: The use of an Express router allows for organized route management, where routes are clearly defined and can be easily maintained or expanded upon.
- **Middleware Usage**: The implementation of `verifyToken` middleware ensures security by validating user authentication before granting access to data endpoints.
- **API Design**: The endpoints exemplify RESTful design principles, focusing on resource-based interactions (e.g., filtering and retrieving data).