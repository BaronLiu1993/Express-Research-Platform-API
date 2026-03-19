# CLAUDE.md for the backend_researcher/ Folder

## Purpose
The `backend_researcher/` folder serves as the root of the backend application, containing the main entry file and organizing all submodules that collectively contribute to the functionality of the research repository system. The folder structure encompasses routing modules, service handlers, queue management, and database interactions with Supabase, Redis, and external APIs. This architecture facilitates smooth data flow, user management, authentication, email handling, and academic engagement functionalities.

If this folder were deleted, the entire backend functionality of the application would cease to operate, as it contains the entry point (`index.js`) where the server is initialized and configured. Consequently, users would lose access to all features offered by the application.

## Files
### 1. backend_researcher/index.js
- **What it does**: Initializes the Express server, sets up middlewares (such as CORS and body parsing), and integrates all router modules for handling specific functionalities within the application.
- **Exports**: The server instance; however, typically this file does not explicitly export routes as it initializes the server.
- **PageRank**: 0.007464
- **Why it matters**: This file is crucial for the overall functioning of the backend application. It is the entry point that starts the server and connects all components, establishing the entire routing structure and middlewares necessary for handling user requests.

### 2. backend_researcher/package.json
- **What it does**: Defines the metadata for the project, including its dependencies, scripts for development, and other configurations necessary for the Node.js environment.
- **Exports**: Not applicable as this is a configuration file.
- **PageRank**: 0.006254
- **Why it matters**: This file is vital in managing the application's dependencies and scripts, making it easier for developers to manage the project and ensuring that all necessary packages are available during development and production.

### 3. backend_researcher/package-lock.json
- **What it does**: Automatically generated file that locks the versions of dependencies used in the project, ensuring consistent installs across different environments.
- **Exports**: Not applicable as this is a generated configuration file.
- **PageRank**: 0.006254
- **Why it matters**: It is important for maintaining dependency integrity and ensuring that all environments use the same package versions.

## Dependency Map
### For `backend_researcher/index.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create and manage the web server and define routes.
  - **HOW it’s used**: The `express()` function initializes the server instance.

- **→ imports `body-parser`**: 
  - **WHAT is imported**: Middleware for parsing incoming request bodies.
  - **WHY it’s needed**: To handle JSON and URL-encoded bodies for HTTP requests.
  - **HOW it’s used**: Configured within the server to parse incoming requests.

- **→ imports `cors`**: 
  - **WHAT is imported**: Middleware for enabling CORS (Cross-Origin Resource Sharing).
  - **WHY it’s needed**: To allow requests from different origins, particularly for client-side applications.
  - **HOW it’s used**: Configured to specify allowable origins and request methods.

- **→ imports `cookie-parser`**: 
  - **WHAT is imported**: Middleware for parsing cookies attached to the client request.
  - **WHY it’s needed**: To manage cookies used within the application for user sessions and authentication.
  - **HOW it’s used**: Called to set the cookie parsing middleware.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: A library for loading environment variables from a `.env` file.
  - **WHY it’s needed**: For secure management of sensitive configuration data.
  - **HOW it’s used**: Invoked with `dotenv.config()` to initialize environment variables.

- **→ imports router modules**: 
  - **WHAT is imported**: Multiple router modules from subdirectories.
  - **WHY it’s needed**: To structure routing for different functionalities within the application.
  - **HOW it’s used**: These routers are integrated into the app using `app.use()` to handle various routes.

## Inbound Dependencies
- There are multiple router files that depend on this folder, as the main server instance in `index.js` integrates all routes from the application structure into a cohesive API.

## Data Flow
1. **Data Entry**: Data enters through API requests to various defined endpoints, initiated by users interacting with the front-end application.
2. **Transformations**: These requests are processed through middlewares that parse request data, authenticate users, and route them to the correct endpoint handlers.
3. **Data Exit**: Responses generated from the data processing (either from database queries, queue handling, or logic within the service layer) are sent back to the client, dictating the outcome of the initial requests.

## Key Patterns
- **Modular Architecture**: The folder structure employs a modular approach, where routing, services, and queuing systems are compartmentalized into distinct folders, enhancing maintainability and scalability.
- **Middleware Usage**: The application utilizes various middleware for processing requests, securing routes, and managing data, ensuring components are well-integrated while maintaining separation of concerns.
- **Environment Configuration**: The use of `dotenv` provides a consistent and secure way to manage sensitive configurations across different environments, aligning with best practices for application security.

---
## Relationship Map
### backend_researcher/index.js
```javascript
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

// Router Imports
import authRouter from "./router/auth/authRouter.js";
import completedRouter from "./router/kanban/completed/completedRouter.js";
import savedRouter from "./router/kanban/saved/savedRouter.js";
import inProgressRouter from "./router/kanban/inProgress/inProgressRouter.js";
import sendRouter from "./router/send/sendRouter.js";
import repositoryRouter from "./router/repository/repositoryRouter.js";
import snippetsRouter from "./router/snippets/snippetsRouter.js";
import inboxRouter from "./router/inbox/inboxRouter.js";
import draftRouter from "./router/inbox/draftRouter.js";
import engagementRouter from "./router/engagement/engagementRouter.js";
import storageRouter from "./router/storage/storageRouter.js";
import grantRouter from "./router/grants/grantRouter.js";

// Queue Workers
import "./queue/sendWorker.js";
import "./queue/draftWorker.js";
import "./queue/followUpWorker.js";
import "./queue/sendWithAttachmentsWorker.js";
import "./queue/followUpDraftWorker.js";
import "./queue/followUpWithAttachmentsWorker.js";

dotenv.config();

const app = express();
const port = 8080;

// Middleware Setup
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Configure Routes
app.use("/storage", storageRouter);
app.use("/auth", authRouter);
app.use("/grants", grantRouter);
app.use("/completed", completedRouter);
app.use("/saved", savedRouter);
app.use("/inprogress", inProgressRouter);
app.use("/send", sendRouter);
app.use("/repository", repositoryRouter);
app.use("/snippets", snippetsRouter);
app.use("/draft", draftRouter);
app.use("/inbox", inboxRouter);
app.use("/engagement", engagementRouter);

// Start Server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `body-parser`**  
Target pagerank: 0.0

**→ imports `cors`**  
Target pagerank: 0.0

**→ imports `cookie-parser`**  
Target pagerank: 0.0

**→ imports `dotenv`**  
Target pagerank: 0.0

**→ imports all router modules**: Each imported router (e.g., `authRouter`, `completedRouter`) facilitates routing for its specific area of functionality.

---

This CLAUDE.md documentation for the `backend_researcher/` folder provides a comprehensive overview of its purpose, structure, file functionalities, data flow, and relationships within the application architecture, serving as a foundational reference for developers engaged in further development and maintenance of the project.