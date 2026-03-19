# CLAUDE.md for `backend_researcher/`

## Summary
The `backend_researcher/` folder serves as the main entry point for a backend application that provides server-side functionality for the University of Toronto Research Repository. It utilizes Express to handle routes, middleware, and various services related to user authentication, kanban task management, engagement, and storage, integrating with Redis for message queueing and persistence.

## Key Files
- **index.js**: The main server file that initializes the Express app, configures middleware, and imports all routers and queue workers.
- **.dockerignore**: Specifies files and directories that should be ignored when building the Docker image.
- **.gitignore**: Lists files and directories to be ignored by Git version control.
- **Dockerfile**: Defines the environment and instructions for building the Docker image for the application.
- **docker-compose.yaml**: Configuration for managing multi-container Docker applications, defining service parameters.
- **package.json**: Contains metadata about the project, including dependencies, scripts, and project description.
- **package-lock.json**: A versioned snapshot of the dependencies to ensure consistent installations across environments.

## Most Important Files by PageRank
1. **index.js** (pagerank: 0.007464): Central entry point where all the routing and server configuration happens.
2. **package.json** (pagerank: 0.006254): Manages the project dependencies and scripts critical for application functionality.
3. **Dockerfile** (pagerank: 0.006254): Key for containerizing the application, making it suitable for deployment.

## Key Relationships
- **Imports from:**
  - Various routers from `./router/*` for handling specific routes (`auth`, `kanban`, `send`, etc.).
  - Middleware libraries like `express`, `body-parser`, `cors`, and `dotenv` for managing requests, environment configuration, and security.
  
- **Depends on:**
  - Service integrations such as `@supabase/supabase-js`, `@elastic/elasticsearch`, and `bullmq` for database operations, pub/sub messaging, and background job processing.
  - Components of the queue from `./queue/*` to process tasks asynchronously.

## Architectural Patterns
- **Modular Routing**: The application follows a modular routing pattern, separating routes based on functionality, improving maintainability and readability.
- **Middleware Pipeline**: Uses middleware for handling requests/responses, such as CORS, body parsing, and cookie handling, demonstrating clean separation of concerns.
- **Service-Oriented Architecture**: Integrates various third-party services (e.g., Redis, Supabase, Elasticsearch) in a way that promotes decoupling and facilitates scalability.
- **Event-Driven Nature**: Leveraging `bullmq` and Redis, the application appears geared toward asynchronous task processing, indicative of event-driven architecture principles.

This structure helps maintain an organized and scalable codebase, critical for a backend handling multiple functionalities and integration points.