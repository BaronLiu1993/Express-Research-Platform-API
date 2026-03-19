# CLAUDE.md

## Repository Summary
This repository is designed for managing a backend service that integrates with Redis, Supabase, and Google APIs to facilitate user engagement, research assistance, and grants management. It primarily focuses on handling user authentication, queue management, and various engaging features to support users in academic and research tasks.

## Folder Structure
- **backend_researcher/**: Main directory containing all backend-related code.
- **backend_researcher/queue/**: Contains services for managing background tasks and message queues.
- **backend_researcher/redis/**: Integration code for Redis, used as a data store for session and task management.
- **backend_researcher/router/**: Houses all route handlers for various application functionalities.
- **backend_researcher/router/auth/**: Manages authentication routes for user sign-in and registration.
- **backend_researcher/router/engagement/**: Contains routes related to user engagement features.
- **backend_researcher/router/engagement/public/**: Holds public-facing assets like images for the engagement features.
- **backend_researcher/router/grants/**: Routes for managing grant-related functionalities.
- **backend_researcher/router/inbox/**: Manages inbox-related functionalities and interactions.
- **backend_researcher/router/kanban/**: Contains modules for managing Kanban-like boards.
- **backend_researcher/router/kanban/completed/**: Handles completed Kanban tasks.
- **backend_researcher/router/kanban/inProgress/**: Manages tasks that are currently in progress.
- **backend_researcher/router/kanban/saved/**: Handles saved tasks in the Kanban system.
- **backend_researcher/router/repository/**: Manages interactions with the research repository.
- **backend_researcher/router/send/**: Contains routes for sending emails and managing drafts.
- **backend_researcher/router/snippets/**: Handles user-created snippets and templates.
- **backend_researcher/router/storage/**: Manages storage and retrieval of user-related data.
- **backend_researcher/services/**: Contains service modules for authentication and Google API integrations.
- **backend_researcher/supabase/**: Integration code for interacting with Supabase services.

## Top Files by Importance (PageRank)
1. **backend_researcher/redis/redis.js** (pagerank: 0.041322): Setup for Redis connection and configuration.
2. **backend_researcher/services/authServices.js** (pagerank: 0.040691): Manages authentication (JWT) and token encryption.
3. **backend_researcher/supabase/supabase.js** (pagerank: 0.018459): Initializes the Supabase client for database interactions.
4. **backend_researcher/queue/queueService.js** (pagerank: 0.017342): Services for generating drafts and managing email queues.
5. **backend_researcher/services/googleServices.js** (pagerank: 0.013758): Interacts with Google APIs for OAuth and email services.
6. **backend_researcher/router/engagement/public/pixel.png** (pagerank: 0.013128): Image asset used in engagement features.
7. **backend_researcher/router/kanban/inProgress/inProgressRouter.js** (pagerank: 0.012629): Route handling for managing in-progress tasks.
8. **backend_researcher/router/kanban/completed/completedrouter.js** (pagerank: 0.012353): Route for managing completed tasks in the Kanban interface.
9. **backend_researcher/router/kanban/saved/savedrouter.js** (pagerank: 0.012353): Route for retrieving saved Kanban tasks.
10. **backend_researcher/router/grants/grantRouter.js** (pagerank: 0.011582): Route handling for grant functionalities.

## Key Cross-Folder Dependencies
- **backend_researcher/queue → backend_researcher/redis**: Queue services rely on Redis for task management (12 imports).
- **backend_researcher/router/inbox → backend_researcher/services**: Inbox routes primarily interact with service modules for data processing (7 imports).
- **backend_researcher/router/send → backend_researcher/queue**: Sending emails depends on queue management (6 imports).
- **backend_researcher/queue → backend_researcher/services**: Queue services use authentication and token services (5 imports).
- **backend_researcher/router/storage → backend_researcher/services**: Storage handling needs services for data manipulation (2 imports).
- Additional dependencies connect various routers to service modules, especially for data retrieval and processing.

## Architecture Overview and Patterns
This repository follows a modular architecture where:
- **Service Layer**: Contains business logic and interactions with external APIs (e.g., Google, Supabase). This layer uses clear interfaces for actions like authentication, data management, and email processing.
- **Controller Layer**: Each router acts as a controller, defining HTTP endpoints and connecting them to appropriate service layer functions, simplifying route management and request handling.
- **Dependency Injection**: Environment variables and configurations are managed using dotenv, promoting flexibility and separation of concerns.
- **Asynchronous Programming**: Promises and async/await patterns are used to handle asynchronous operations, particularly in service methods that deal with API calls and database interactions, helping maintain responsiveness in the application.