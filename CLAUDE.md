```md
# CLAUDE.md - Comprehensive Context for Backend Researcher Project

## What This Repository Does
The **Backend Researcher Project** facilitates efficient research-related correspondence for users through a sophisticated queue and messaging system. By integrating various Google services, Redis for message queuing, and Supabase as a backend database, the platform helps users manage and automate tasks related to email drafts, snippets, and follow-ups. As a result, it solves the problem of streamlining the communication process, allowing users to focus more on research and less on administrative tasks. Target audience includes researchers, academic staff, and individuals who require structured email management.

## Architecture Overview
This project employs a **modular architecture pattern**, dividing the system into distinct folders, each encapsulating specific functionalities. This design not only promotes maintainability but also enhances the clarity of data flow throughout the application.

- **Router Layer**: The **router folder** handles incoming HTTP requests and directs them to appropriate service functions based on the endpoint.
- **Queue Layer**: The **queue folder** is responsible for processing asynchronous tasks and managing the message queue.
- **Service Layer**: The **services folder** includes business logic regarding authentication, data manipulation, and integrations with external APIs.

### Data Flow
Data flows systematically through the following components:
1. **HTTP Request Entry**: Requests enter through routers, invoking specific endpoints for processing.
2. **Service Invocation**: Each router calls a corresponding service method which performs required operations, including authentication and data retrieval.
3. **Queue Processing**: The queue is utilized to handle asynchronous email tasks, ensuring they are processed without blocking HTTP responses.
4. **External API Communication**: Services interact with external APIs like Google and Supabase for managing tokens and data storage.
5. **Final Response**: The processed results are sent back to the client, completing the user request cycle.

## Folder Structure
- **backend_researcher/**: The root folder containing the entry point of the application and overall project setup.
- **backend_researcher/queue/**: Contains implementation for queuing tasks related to email and follow-up management.
  - **Important File**: `queueService.js` handles the logic to create draft emails and manage email tasks.
  - **Dependencies**: Uses `uuid`, `dotenv`, `mustache`, and integrates with services from `backend_researcher/services/`.
- **backend_researcher/redis/**: Handles connections to Redis, enabling message queuing capabilities.
  - **Important File**: `redis.js` configures the Redis client connection.
  - **Dependencies**: Utilizes `ioredis` for Redis connectivity.
- **backend_researcher/router/**: Each folder within governs specific routes (e.g., authentication, engagement, kanban) for processing user requests.
  - **Important File**: `authRouter.js` controls user login and registration.
- **backend_researcher/services/**: Contains all business logic, API calls, and interactions needed for the application.
  - **Important File**: `authServices.js`, responsible for user authentication and token management.
- **backend_researcher/supabase/**: Configurations to manage interactions with the Supabase service for user management and database operations.
  - **Important File**: `supabase.js` initializes the Supabase client.

## Critical Files (by PageRank)  
Files with the highest dependency rank that are frequently accessed throughout the codebase include:
- **backend_researcher/redis/redis.js**: 
  - Establishes a connection to Redis for message queuing.
- **backend_researcher/services/authServices.js**: 
  - Manages authentication, token signing, and integration with OpenAI API for generating embeddings.
- **backend_researcher/supabase/supabase.js**: 
  - Initializes connection with Supabase to manage authentication.
- **backend_researcher/queue/queueService.js**: 
  - Primary service for managing email drafts and queuing.
- **backend_researcher/services/googleServices.js**: 
  - Interfaces with Google APIs for handling email-related operations.

## Module Dependency Map
This section illustrates cross-folder dependencies, shedding light on integral modules:
- **queue → redis**: The queue service files heavily rely on Redis for managing message queues. Without this, the asynchronous email management functionality would be halted.
- **router → services**: Routers depend on services for processing business logic. Breaking these ties affects the functionality of API endpoints.
- **services → supabase**: Authentication workflows and user interactions depend on integrations with Supabase for securing sessions and managing user data.

## Request Flow
A typical request's journey through the system involves multiple interactions:
1. **Client Request**: A user submits a request to send an email.
2. **Router Handling**: The request hits `sendRouter.js`, which invokes associated service methods.
3. **Service Logic**: The service method, say, `queueService.js`, processes the request, generating necessary drafts and utilizing Redis for queuing.
4. **Async Task Management**: The email draft is queued via a Redis operation, preparing it for asynchronous processing.
5. **API Interaction**: Needed actions such as token management or fetching user information are handled through `authServices.js` and Google API services.
6. **Response Back to Client**: Once all tasks are completed, results return to the user from the router layer.

## Environment & Configuration
Settings for seamless operation of the project include:
- **Environment Variables**: Managed via `dotenv`, critical variables include:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Supabase credentials)
  - `OPENAI_API_KEY` (for OpenAI services)
  - `REDIS_HOST`, `REDIS_PORT` (Redis configurations)
  - `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` (for Google OAuth).
- **External Services**: System requires integration with Supabase, OpenAI API, and Google API services for full functionality.

## Shared Repository Context
This CLAUDE.md file serves as a high-level overview of the Backend Researcher Project, aiding AI agents in crafting more detailed and specific documentation at folder and file levels. It encapsulates essential understanding of how diverse components of the system interconnect and function collectively, ensuring cohesive operation throughout the application.
```