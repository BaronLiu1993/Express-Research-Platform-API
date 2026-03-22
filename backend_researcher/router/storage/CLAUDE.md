# CLAUDE.md for `backend_researcher/router/storage/`

## Purpose
The `backend_researcher/router/storage/` folder is responsible for managing file storage-related operations within the backend of the Backend Researcher Project. This includes endpoints for uploading user files such as transcripts and resumes and retrieving links to these files stored in external services (e.g., Google Drive or similar). 
If this folder is deleted, the application will lose its ability to handle file uploads and file retrievals, which are essential for user profiles in the system. This folder fits into the backend architecture as part of the router component, linking user interactions to the underlying storage services and ensuring that files are processed correctly while maintaining security protocols.

## Files

### 1. `storageMiddleware.js`
#### Purpose
This file defines middleware that utilizes `multer` for parsing file uploads. It sets up configuration to handle file types that are allowed for upload (JPEG, PNG, and PDF).

#### Exports
- `uploadInstance`: Middleware configuration for handling file uploads.

#### PageRank
0.009648

#### Why It Matters
This middleware lays the groundwork for file handling, ensuring only the appropriate content types are accepted and stored temporarily in memory, contributing to the application's overall functionality and security.

---

### 2. `storageRouter.js`
#### Purpose
This file defines routes for handling storage-related requests, including uploading transcripts and resumes, and retrieving file links associated with user profiles.

#### Export
- `router`: An instance of the express Router that contains the various HTTP routes and their associated handlers.

#### PageRank
0.008849

#### Why It Matters
`storageRouter.js` provides the entry points for all storage-related actions, facilitating file uploads, interactions with the Google Drive API, and database updates in Supabase. Its successful operation is critical for managing user document submissions and retrievals.

## Dependency Map

### In `storageMiddleware.js`
- **`multer`**
  - **Imported**: A library to handle multipart/form-data (file uploads).
  - **Needed**: Required for configuring file upload processing.
  - **Used**: Configured to create an instance (`uploadInstance`) for file handling in the storage routes.

### In `storageRouter.js`
- **`express`**
  - **Imported**: The web application framework for building the API.
  - **Needed**: Essential for routing and handling HTTP requests and responses.
  - **Used**: Creates an Express Router instance.

- **`googleapis`**
  - **Imported**: Library for interacting with various Google services including Google Drive.
  - **Needed**: Required to upload files to Google Drive and manage OAuth tokens.
  - **Used**: Utilized in configuring OAuth and making requests to the Drive API.

- **`dotenv`**
  - **Imported**: A module to manage environment variables.
  - **Needed**: Required to load sensitive data and configuration variables.
  - **Used**: Configured at the beginning of the router file to enable access to environment variables.

- **`backend_researcher/router/storage/storageMiddleware.js`**
  - **Imported**: The middleware file that sets up file upload handling.
  - **Needed**: Required to process incoming file uploads with multer.
  - **Used**: Referenced in the route definitions for file uploads.

- **`node:stream`**
  - **Imported**: Node.js stream module for handling streaming data.
  - **Needed**: Useful for processing file buffer data before uploading.
  - **Used**: Creates a Readable stream for transporting the uploaded file to Google Drive.

- **`backend_researcher/services/authServices.js`**
  - **Imported**: Contains authentication-related functionalities.
  - **Needed**: Used for verifying user tokens in routes.
  - **Used**: Calls `verifyToken` to secure endpoints dealing with file uploads and retrievals.

- **`backend_researcher/services/googleServices.js`**
  - **Imported**: Contains Google API interaction methods.
  - **Needed**: Useful for configuring OAuth to access Google services securely.
  - **Used**: Calls `configureOAuth` to set up necessary OAuth credentials for Drive interactions.

## Inbound Dependencies
The following external file(s) depend on this folder:
- **`backend_researcher/index.js`**
  - This index file imports `backend_researcher/router/storage/storageRouter.js` to integrate the storage routes into the application's main routing structure.

## Data Flow
1. **File Upload**: A client invokes either '/upload-transcript-links' or '/upload-resume-links' POST route by sending a multipart form-data request with a file.
2. **Middleware Processing**: The request passes through `uploadInstance`, which verifies the file type and stores the file temporarily in memory.
3. **Authorization**: The `verifyToken` function checks the user's authentication before processing further.
4. **OAuth Configuration**: The application configures the OAuth client utilizing `configureOAuth` to enable access to the user's Google Drive.
5. **Google Drive Upload**: The file is streamed to Google Drive where it is created using the Drive API.
6. **Database Update**: The application updates the user’s profile in Supabase with the file information (e.g., Google Drive file ID).
7. **Response**: The route responds back to the client with success or error messages regarding the upload process.

## Key Patterns
- **Modular Route Handling**: The folder adheres to a modular approach, creating distinct routes for separate functionalities (file retrieval vs. file uploads).
- **Error Handling**: Consistent pattern of usage of try-catch blocks for managing exceptions and returning pertinent HTTP status codes.
- **Secure File Uploads**: Utilizes middleware to filter and validate file types, ensuring only authorized files are processed.
- **Token Verification**: Incorporates security through token verification before allowing access to sensitive operations.

By encapsulating these functionalities properly, the **storage router** ensures a robust and organized way of handling user file requirements while integrating seamlessly with the rest of the Backend Researcher Project architecture.