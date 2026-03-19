# CLAUDE.md for the backend_researcher/router/storage/ Folder

## Purpose
The `backend_researcher/router/storage/` folder is responsible for handling routes that allow users to manage file uploads and retrievals related to their academic documents (e.g., transcripts and resumes). This functionality is critical for users who need to store and access their documents within the application.

If this folder were deleted, the application would lose all functionality related to file management, which would severely impact users’ ability to upload, store, and access important academic documents, thereby disrupting essential parts of the user flow.

## Files
### 1. backend_researcher/router/storage/storageMiddleware.js
- **What it does**: Implements a middleware that utilizes `multer` to handle file uploads. It defines memory storage for uploaded files and a filter to allow only specific file types (JPEG, PNG, PDF).
- **Exports**: `uploadInstance` - an instance of the multer middleware configured for handling file uploads.
- **PageRank**: 0.009648
- **Why it matters**: This file is essential for managing file uploads in the application, ensuring that only appropriate files are accepted, which maintains the integrity of user-uploaded content.

### 2. backend_researcher/router/storage/storageRouter.js
- **What it does**: Defines API routes for retrieving file links, uploading transcripts and resumes, and managing associated user data. It ensures secure access to these routes through authentication.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.008849
- **Why it matters**: This file provides the necessary mechanisms for users to manage and access their personal documents directly from the application, which is a critical feature for users engaged in academic pursuits.

## Dependency Map
### For `backend_researcher/router/storage/storageMiddleware.js`
- **→ imports `multer`**: 
  - **WHAT is imported**: A middleware for handling multipart/form-data, which is primarily used for uploading files.
  - **WHY it’s needed**: Essential for enabling file input handling for uploaded documents.
  - **HOW it’s used**: Configured to manage file storage options and file type validation.

### For `backend_researcher/router/storage/storageRouter.js`
- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create a router instance and define the API routes for managing file operations.
  - **HOW it’s used**: The `express.Router()` method creates a new router for handling storage-related API paths.

- **→ imports `googleapis`**: 
  - **WHAT is imported**: Google API client library.
  - **WHY it’s needed**: To interact with Google Drive for storing user-uploaded documents.
  - **HOW it’s used**: The OAuth client is initialized to manage file uploads directly to the user's Google Drive.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: A library for managing environment variables.
  - **WHY it’s needed**: To securely load sensitive configuration details like API credentials.
  - **HOW it’s used**: Called with `dotenv.config()` to set up environment variables before they are utilized.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: Functions for verifying user tokens and managing authentication.
  - **WHY it’s needed**: To secure routes ensuring only authenticated users can upload and manage their files.
  - **HOW it’s used**: The `verifyToken` middleware is applied to the routes, validating user requests before executing any storage logic.

- **→ imports `node:stream`**: 
  - **WHAT is imported**: Node.js built-in stream module.
  - **WHY it’s needed**: To enable file buffering during upload operations.
  - **HOW it’s used**: Used to create a stream from the uploaded file buffer for transfer to Google Drive.

## Inbound Dependencies
- **backend_researcher/index.js**: This main entry file imports `storageRouter.js` to integrate storage-related functionalities into the overall routing structure of the application, ensuring users can access these features.

## Data Flow
1. **Data Entry**: Incoming data enters through HTTP POST requests made to the defined routes (e.g., `/upload-transcript-links`).
2. **Transformations**: The router uses the middleware to handle uploaded files, checking file types and buffering the data for upload. After token verification, the document is sent to Google Drive for storage.
3. **Data Exit**: Resultant confirmations or errors regarding the upload processes are sent back to the client in JSON format, allowing users to understand the outcome of their uploads.

## Key Patterns
- **Middleware for File Handling**: The use of `multer` as middleware follows best practices for file uploads, encapsulating file management functionality separately from business logic.
- **OAuth2 Integration**: The router’s design implements Google OAuth2 for file storage, maintaining a secure yet functional integration with external services.
- **Consistent Error Handling**: The implementation includes established error handling patterns across routes, ensuring users receive meaningful feedback in case of issues during file handling.

---
## Relationship Map
### backend_researcher/router/storage/storageRouter.js
```javascript
import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import { uploadInstance } from "./storageMiddleware.js";
import { Readable } from "node:stream";
import { decryptToken, verifyToken } from "../../services/authServices.js";
import { configureOAuth } from "../../services/googleServices.js";

const router = express.Router();
dotenv.config();

router.get("/get-file-links", verifyToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: linkData, error: fetchDataError } = await req.supabaseClient
      .from("User_Profiles")
      .select("transcript, resume")
      .eq("user_id", userId)
      .single();

    if (fetchDataError) {
      return res.status(400).json({ message: "Data Fetch Error" });
    }
    return res.status(200).json({ data: linkData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Uploading Transcripts
router.post(
  "/upload-transcript-links",
  verifyToken,
  uploadInstance.single("file"),
  async (req, res) => {
    const userId = req.user.sub;
    console.log(userId);
    const file = req.file;
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    console.log("fired");
    try {
      const oAuthClient = await configureOAuth({
        userId,
        supabase: req.supabaseClient,
        fetchDrive: true,
      });

      const drive = oAuthClient.drive;

      const response = await drive.files.create({
        requestBody: {
          name: file.originalname,
          mimeType: file.mimetype,
        },
        media: {
          mimeType: file.mimetype,
          body: bufferStream,
        },
      });
      
      const { error: insertionError } = await req.supabaseClient
        .from("User_Profiles")
        .update({ transcript: response.data.id })
        .eq("user_id", userId);

      console.log(insertionError);
      if (insertionError) {
        return res.status(400).json({ message: "Failed To Insert" });
      }

      return res.status(200).json({ message: "Successfully Inserted" });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);
```

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `googleapis`**  
Target pagerank: 0.0

**→ imports `dotenv`**  
Target pagerank: 0.0

**→ imports `backend_researcher/router/storage/storageMiddleware.js`**  
Target pagerank: 0.009648

**→ imports `node:stream`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

**→ imports `backend_researcher/services/googleServices.js`**  
Target exports: decodeBody, configureOAuth, getDriveFileBuffer, extractHtmlOrPlainText, makeReplyBody, makeBody  
Target pagerank: 0.013758

---

This CLAUDE.md documentation for the `backend_researcher/router/storage/` folder provides a detailed overview of its purpose, file functionalities, data flow, and relationships within the application's architecture, serving as a crucial reference for developers working with file management features in the application.