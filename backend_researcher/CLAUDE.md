# CLAUDE.md - Context Summary for backend_researcher Folder

## Purpose
The **backend_researcher** folder serves as the primary backend for managing user research-related communication and tasks via an email and queue management system. It efficiently handles various functionalities such as user authentication, email drafting, and processing follow-ups. Deleting this folder would break core functionalities of the project as it includes essential routing for API requests and interactions with external services (like Google APIs and Supabase) critical for user operations and data management.

This backend architecture aligns effectively with the modular design principles, promoting organized code separation and interaction handling. It communicates with queue systems (e.g., BullMQ) for asynchronous tasks, ensuring that email operations are processed without blocking the main thread.

## Files
### 1. redis/
- **redis.js**
  - **Purpose**: This file establishes the Redis connection which serves as the backend for managing queues in the application. It leverages the ioredis library for performant Redis interactions.
  - **Exports**: Exports the Redis connection instance as `Connection`, allowing other modules to utilize the Redis connection for task queuing.
  - **PageRank**: 0.041322
  - **Importance**: Essential for ensuring a scalable queueing system that handles asynchronous email operations smoothly and efficiently. 

### 2. services/
- **authServices.js**
  - **Purpose**: This file manages user authentication, token validation, and integration with OpenAI for handling email embeddings.
  - **Exports**: Functions for user authentication, such as `verifyToken`, which validates incoming requests.
  - **PageRank**: 0.040691
  - **Importance**: Critical for safeguarding routes requiring user authentication and enabling personalized email handling based on user data.

- **googleServices.js**
  - **Purpose**: Contains methods for integrating with Google APIs, particularly for email handling and manipulation.
  - **Exports**: Functions for data extraction and email processing that interact with the Google API.
  - **PageRank**: 0.013758
  - **Importance**: Vital for the integration of Google services, enabling the application to send emails and extract data necessary for user communication flows.

### 3. queue/
- **queueService.js**
  - **Purpose**: Encapsulates the business logic for generating and sending emails, managing enqueue and dequeue operations for email drafts, and handling a variety of message types.
  - **Exports**: Various functions for email handling operations, including sending drafts and handling feedback from queues.
  - **PageRank**: 0.017342
  - **Importance**: The backbone of asynchronous email processing, connecting with Redis queueing systems to ensure a responsive user experience.

### 4. router/
- **authRouter.js**
  - **Purpose**: Manages authentication-related routes such as login and user registration.
  - **Exports**: Router instance configured to handle auth routes securely.
  - **PageRank**: 0.0
  - **Importance**: Essential for the authentication workflow in the application, ensuring secure user authorization.

- **engagementRouter.js**
  - **Purpose**: Handles routes related to user engagement metrics, such as tracking email opens.
  - **Exports**: Router instance managing engagement-related operations.
  - **PageRank**: 0.008849
  - **Importance**: Integral for tracking user interactions and improving application engagement.

- Additional routers (e.g., **inboxRouter.js**, **kanbanRouter.js**, **snippetsRouter.js**) serve the same purpose for their specific functionalities, managing routes for respective domain operations.

## Dependency Map
- **redis/redis.js** → `ioredis`: Establishes connection to Redis server for managing the queue's state and operations.
- **services/authServices.js** → `jsonwebtoken`: Utilized for token creation and validation to manage user sessions securely.
- **services/googleServices.js** → `googleapis`: Used to connect and interact with Google services (Gmail, etc.) for email processing.
- **queue/queueService.js** → `bullmq`: The central library for managing task queues in a scalable and performant way.

Each of these dependencies is critical for establishing the various functionalities of the backend system, ensuring smooth operation and maintainability of the codebase.

## Inbound Dependencies
### Files that depend on backend_researcher:
- **authRouter.js** utilizes functions from **authServices.js** to manage user authentication.
- **engagementRouter.js** interacts with **supabase.js** for engagement data tracking.
- **inboxRouter.js** depends on **googleServices.js** to extract email content and manage drafts.
- **sendRouter.js** interacts heavily with **queueService.js** for email send operations and utilizes multiple queues for message processing.

## Data Flow
1. **Data Entry**: Client requests (like sending an email) are initiated through various endpoints defined in the router files.
2. **Routing**: The request hits the corresponding router where the relevant service, such as **authServices.js** or **googleServices.js**, performs the required operations.
3. **Queueing Tasks**: For asynchronous tasks (e.g., sending emails), the services utilize the **queueService.js** to enqueue operations to Redis.
4. **Processing**: Workers from **queue/** handle jobs drawn from Redis, executing tasks such as sending emails or generating drafts.
5. **Response**: Once complete, the worker returns feedback which is managed back through the router to respond to the client request.

## Key Patterns
- **Asynchronous Processing**: Utilizes queue handling for tasks that would otherwise block the main thread, improving performance and responsiveness.
- **Modular Approach**: Files are organized into specific functionality (services, routers, queues) promoting clarity and maintainability.
- **Strong Dependency Management**: Each module imports only what is necessary for its operation, reducing coupling and enhancing testability.

By adhering to these patterns, the **backend_researcher** folder ensures high-quality code organization and execution, allowing for a robust backend service that can efficiently handle user demands within the architecture.