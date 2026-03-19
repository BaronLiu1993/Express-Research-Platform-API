# CLAUDE.md for the backend_researcher/router/auth/ Folder

## Purpose
The `backend_researcher/router/auth/` folder is responsible for managing authentication-related routes in the application, primarily using OAuth2 for signing users in and signing them up via Google. This folder facilitates the integration with Google for user authentication, such as obtaining user profile information or access tokens for further interactions with Google services.

If this folder were deleted, the application would lose all functionalities related to user authentication via Google, making it impossible for users to sign in or register. This would significantly hinder user access to the application's features that require authenticated sessions.

## Files
### 1. backend_researcher/router/auth/authrouter.js
- **What it does**: Defines the API routes for user authentication, allowing signup and login through Google OAuth. It handles redirects and processes authentication callbacks from Google.
- **Exports**: `router` - the configured Express router.
- **PageRank**: 0.011307
- **Why it matters**: This file is critical for ensuring that users can securely access the application, maintaining effective user management and legitimate access to user data.

## Dependency Map
### For `backend_researcher/router/auth/authrouter.js`
- **→ imports `backend_researcher/supabase/supabase.js`**: 
  - **WHAT is imported**: The Supabase client instance.
  - **WHY it’s needed**: To facilitate user authentication and session management through Supabase.
  - **HOW it’s used**: The `supabase.auth.signInWithOAuth` method uses this import to manage user sign-in processes.

- **→ imports `express`**: 
  - **WHAT is imported**: The Express framework.
  - **WHY it’s needed**: To create and manage the API router instance and define authentication routes.
  - **HOW it’s used**: The `express.Router()` method is called to create a new router for routing authentication-related requests.

- **→ imports `googleapis`**: 
  - **WHAT is imported**: Google API client library.
  - **WHY it’s needed**: To handle OAuth2 authentication processes with Google.
  - **HOW it’s used**: Initializes an OAuth2 client to manage authentication and token exchange.

- **→ imports `backend_researcher/services/authServices.js`**: 
  - **WHAT is imported**: Functions for token management and user authentication.
  - **WHY it’s needed**: To handle the secure processing of tokens and authentication flows.
  - **HOW it’s used**: Functions like `verifyToken` could be used, although it's primarily noted for interactions with the Supabase client here.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: A library to manage environment configuration.
  - **WHY it’s needed**: To load API keys and other sensitive configurations from environment variables securely.
  - **HOW it’s used**: `dotenv.config()` is called at the start of the router file to set up the environment variables.

## Inbound Dependencies
- **backend_researcher/index.js**: This main entry point imports `authrouter.js`, enabling the authentication routes as part of the overall routing system for the application.

## Data Flow
1. **Data Entry**: Data enters through HTTP GET or POST requests to the defined authentication routes (e.g., `/signup-with-google` or `/signin-with-google`).
2. **Transformations**: The router processes requests, calling the appropriate methods to initiate Google OAuth flows and exchanges codes for session tokens.
3. **Data Exit**: Upon completion of authentication, the router sends back responses indicating success, redirects the user to specified URLs, or provides error messages if authentication fails.

## Key Patterns
- **Middleware for Authentication**: The consistent application of token verification in routes ensures security in accessing sensitive data and performing critical actions.
- **OAuth2 Flow Management**: This folder follows the OAuth2 flow patterns, leveraging redirects and token exchanges efficiently, which is a common practice when integrating third-party authentication services.
- **RESTful API Design**: The routes conform to RESTful principles, using clear and descriptive endpoint structures that are user-friendly and easy to maintain.

---
## Relationship Map
### backend_researcher/router/auth/authrouter.js
```javascript
import { supabase } from "../../supabase/supabase.js";
import express from "express";
import { google } from "googleapis";
import {
  encryptToken,
  generateEmbeddings,
  verifyToken,
} from "../../services/authServices.js";
import dotenv from "dotenv";

dotenv.config();

// Initialise Gmail OAuth Client
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Defined Scopes
const scopes = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.file",
];

router.get("/signup-with-google", async (req, res) => {
  try {
    const { data: callbackData, error: authError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "http://localhost:3000/account/register",
          scopes: scopes.join(" "),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

    if (authError) {
      return res.status(400).json({ message: "Authentication Error" });
    }

    if (callbackData.url) {
      res.redirect(callbackData.url);
    }
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// More routes...
```

**→ imports `backend_researcher/supabase/supabase.js`**  
Target pagerank: 0.018459

**→ imports `express`**  
Target pagerank: 0.0

**→ imports `googleapis`**  
Target pagerank: 0.0

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

**→ imports `dotenv`**  
Target pagerank: 0.0

---

This CLAUDE.md documentation for the `backend_researcher/router/auth/` folder provides a thorough overview of its purpose, functionality, data flow, and its relationship within the overall architecture, aiding developers in leveraging and understanding the authentication system of the application.