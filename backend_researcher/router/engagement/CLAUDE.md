# CLAUDE.md - Context for `backend_researcher/router/engagement/`

## Purpose
The **engagement router** is crucial for tracking user interaction with emails by processing pixel tracking requests. Specifically, this folder contains code that handles requests to update the application’s database when an email is opened by a recipient through a tracking pixel embedded in emails. If this folder and its contents were deleted, the system would lose the ability to log email opens, which is critical for understanding user engagement and improving communication strategies. This functionality fits into the broader architecture of the application, serving as an endpoint within the **router** layer to facilitate communication between the client (email sent) and the backend service (database update).

## Files

### 1. `engagementRouter.js`
- **What it does**: The `engagementRouter.js` sets up an Express router used to handle HTTP GET requests for tracking email opens through a pixel image. The router processes incoming requests that include a query parameter, `analyticId`, checks for its presence, and updates the corresponding record in the Supabase database to log when an email has been opened.
- **Exports**: The file exports the router as the default export, enabling its integration with the main application server.
- **PageRank**: 0.008849; this shows its relative importance in the entire project, indicating that while it serves a significant specific function, it is connected with fewer high-importance dependencies.
- **Why it matters**: The file is essential for tracking user engagement and providing valuable insights into email effectiveness, pivotal for optimizing outreach in research-related communications.

## Dependency Map
- **`engagementRouter.js` → `supabase`**
  - **What is imported**: The `supabase` import allows access to the Supabase service client for database interactions.
  - **Why it's needed**: It's required to update records in the `Messages` table to log the timestamp of when an email is opened.
  - **How it's used**: The router makes an asynchronous call to Supabase to update the database when an email opening is tracked, signified by the `analyticId`.

- **`engagementRouter.js` → `express`**
  - **What is imported**: The `express` module is imported to create an instance of the router.
  - **Why it's needed**: Express is the web framework utilized for setting up the server routing.
  - **How it's used**: It’s used to define the router object and register an HTTP GET endpoint.

- **`engagementRouter.js` → `path`**
  - **What is imported**: The `path` module is imported to handle file system paths.
  - **Why it's needed**: It is required to construct a file path for the pixel image served as a response.
  - **How it's used**: The `path.join` method is used to dynamically build the file path for the pixel image located in the "public" folder.

- **`engagementRouter.js` → `url`**
  - **What is imported**: The `url` module is imported to resolve the filename of the current module.
  - **Why it's needed**: It is critical for determining the current file’s location to correctly resolve relative paths.
  - **How it's used**: The `fileURLToPath` method is used to convert the module's URL into a valid file path.

## Inbound Dependencies
- The primary inbound dependency of this file is from `backend_researcher/index.js`, which imports `engagementRouter.js`. The `index.js` file is likely responsible for aggregating all routers and setting up the main Express app.

## Data Flow
1. **Data Entry**: When a tracking pixel is requested (e.g., an email recipient opens an email), the request hits the endpoint defined in `engagementRouter.js` (e.g., `/pixel.png`).
2. **Data Transform**: The router extracts the `analyticId` from the query parameters. If provided, it gathers additional data (current timestamp) and updates the corresponding record in the Supabase database to indicate that the email was opened.
3. **Data Exit**: After processing, the router sends back a pixel image response to the requestor, indicating successful tracking, while also updating the logs in the database.

## Key Patterns
- **Asynchronous Handling**: The router employs async/await for the database updates, reflecting a modern JavaScript pattern that ensures non-blocking operations.
- **Clean Separation of Concerns**: The routing logic is effectively isolated from database interactions by using the Supabase client, promoting maintainability.
- **Express Router Usage**: The engagement router exemplifies how to route requests in Express by creating a specific endpoint for tracking-related functionality, streamlining request handling for a dedicated feature.

This documentation provides a comprehensive overview of the engagement router, detailing its purpose, functionality, dependencies, data flow, and patterns in the context of the backend researcher project.