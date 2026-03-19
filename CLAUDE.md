# CLAUDE.md for the backend_researcher Repository

## What This Repository Does
The **backend_researcher** repository provides a backend application designed to facilitate email communication and management for researchers communicating with academic contacts. It automates email drafting, sending, and tracking through integration with Google APIs and a database backend powered by Supabase. The project specifically targets researchers, students, and academia professionals who need streamlined email workflows for effective engagement with professors or collaborators. The system alleviates the tedious workload of email management, allowing users to focus more on their research activities.

## Architecture Overview
- **Modular Structure**: This project utilizes a modular architecture, dividing functionalities into distinct folders. Each folder is responsible for a specific aspect of the application (e.g., routing, services, queues).
- **Request Flow**: Incoming HTTP requests are routed through various routers based on the requested endpoints, eventually triggering functions defined in service files that contain the business logic.
- **Middleware**: Middleware is employed to manage tasks such as authentication (with JWT tokens) and to handle data processing.
- **Module Communication**: Routers communicate with services to perform operations. Services often interact with external APIs (like Google) and the Supabase database, while background processing tasks are managed through a queue system.

## Folder Structure
- **backend_researcher/**: The main application entry point. It initializes the server and imports router modules.
- **backend_researcher/queue/**: Implements queue management for email sending and processing, central to background tasks. **Most Important File**: `queueService.js`
- **backend_researcher/redis/**: Configures Redis for managing queues and caching. **Most Important File**: `redis.js`
- **backend_researcher/router/**: Hosts routers that define the application’s API endpoints for different features like engagement, grants, and inbox management. **Most Important File**: Router files vary by feature.
- **backend_researcher/services/**: Contains service modules that encapsulate business logic, interactions with databases and external APIs. **Most Important File**: `authServices.js`
- **backend_researcher/supabase/**: Manages configurations and connections to Supabase for user management and storage. **Most Important File**: `supabase.js`

## Critical Files (by PageRank)
1. **backend_researcher/redis/redis.js**: Establishes a connection to the Redis database, critical for implementing queues.
2. **backend_researcher/services/authServices.js**: Handles authentication processes and ensures secure interactions with users; exports essential functions for encryption and token validation.
3. **backend_researcher/supabase/supabase.js**: Initializes Supabase client for database operations and user authentication management.
4. **backend_researcher/queue/queueService.js**: Implements functions for email processing, central to the functionality of draft and follow-up email communications.
5. **backend_researcher/services/googleServices.js**: Facilitates interactions with Google APIs, crucial for composing and sending emails.

## Module Dependency Map
- **backend_researcher/queue → backend_researcher/redis**: Essential for queue management; without Redis, the email processing functionality would fail due to lack of a task management backend.
- **backend_researcher/router/inbox → backend_researcher/services**: Requires services for authentication and Google API interactions; failure in these services will impair inbox functionality.
- **backend_researcher/router/send → backend_researcher/queue**: Relies on the queue for processing email sending tasks; without it, sending functionality would not operate.
- **backend_researcher/services → @supabase**: Directly connected to Supabase for database operations; without this connection, database-related actions would be impossible.
  
## Request Flow
1. **Request Entry**: A user sends a request to a defined API endpoint (e.g., GET `/send/email`).
2. **Router Handling**: The request is routed through `sendRouter.js`, which invokes methods to handle email requests.
3. **Service Invocation**: The router calls relevant functions from `queueService.js` to manage email generation and sending.
4. **Queue Management**: Tasks are added to Redis queues for processing via worker scripts.
5. **Response**: After processing (sending email or inserting into the database), a response is returned to the user indicating success or error.

## Environment & Configuration
### Environment Variables
- `REDIS_HOST`: Host of the Redis instance.
- `REDIS_PORT`: Port on which Redis is listening.
- `SUPABASE_URL`: URL for the Supabase backend.
- `SUPABASE_ANON_KEY`: The anonymous key for Supabase access.
- `OPENAI_API_KEY`: Key for accessing OpenAI services.
- `GMAIL_SECRET_KEY`: Key used for encrypting Gmail tokens.
- `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`: Credentials for Google OAuth2.

### External Services
- **Redis**: Used for queue management.
- **Supabase**: For user authentication and data management.
- **Google APIs**: Utilized for email sending and management.

---

## Top Files by PageRank
- `backend_researcher/redis/redis.js` (pagerank: 0.041322)
- `backend_researcher/services/authServices.js` (pagerank: 0.040691)
- `backend_researcher/supabase/supabase.js` (pagerank: 0.018459)
- `backend_researcher/queue/queueService.js` (pagerank: 0.017342)
- `backend_researcher/services/googleServices.js` (pagerank: 0.013758)
- Other relevant files in routing and additional services.

## Full Dependency Chain
- Details all dependencies between modules and services, emphasizing the importance of each file in maintaining the overall functionality of the system.

This CLAUDE.md serves as a comprehensive guide, providing essential context for understanding and navigating the **backend_researcher** repository.