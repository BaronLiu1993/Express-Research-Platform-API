# CLAUDE.md for the backend_researcher/services/ Folder

## Purpose
The `backend_researcher/services/` folder contains modules that encapsulate the business logic necessary to manage user authentication, interact with external APIs (especially Google services), and perform sensitive data handling such as encryption and decryption of tokens. It plays a critical role in the application by providing necessary functionality to the routers and other modules, enabling secure communications and data management.

If this folder were deleted, the application would lose essential functionalities related to user authentication, email composing and sending, and token management, significantly diminishing the effectiveness of the email management system.

## Files
### 1. backend_researcher/services/authServices.js
- **What it does**: Manages user authentication logic, including token encryption, decryption, and verification. It interfaces with Supabase for user management and integrates OpenAI for generating embeddings.
- **Exports**: `encryptToken`, `decryptToken`, `generateEmbeddings`, `verifyToken`
- **PageRank**: 0.040691
- **Why it matters**: This file is central for maintaining secure user sessions and processing email-related tasks requiring identity verification. It ensures only authenticated users can access certain features of the application.

### 2. backend_researcher/services/googleServices.js
- **What it does**: Facilitates interactions with Google APIs for email management, including sending emails and managing OAuth credentials for access tokens.
- **Exports**: `decodeBody`, `configureOAuth`, `getDriveFileBuffer`, `extractHtmlOrPlainText`, `makeReplyBody`, `makeBody`.
- **PageRank**: 0.013758
- **Why it matters**: This file is crucial for integrating Google services into the application, allowing for actions such as composing, sending, and managing drafts of emails. It enhances the overall functionality of the email management system.

## Dependency Map
### For `backend_researcher/services/authServices.js`
- **→ imports `openai`**: 
  - **WHAT is imported**: OpenAI SDK for generating embeddings.
  - **WHY it’s needed**: Provides functionality for language processing tasks necessary for generating content based on user input.
  - **HOW it’s used**: The `generateEmbeddings` function uses this import to create embeddings for research inputs.

- **→ imports `dotenv`**: 
  - **WHAT is imported**: Configuration management library.
  - **WHY it’s needed**: Loads environment variables, crucial for sensitive information like API keys.
  - **HOW it’s used**: Invoked at the beginning of the file to ensure all required configuration is available.

- **→ imports `jsonwebtoken`**: 
  - **WHAT is imported**: Library to handle JSON Web Tokens (JWT).
  - **WHY it’s needed**: Aids in verifying user tokens for secure authenticated requests.
  - **HOW it’s used**: The `verifyToken` function calls this library to check the validity of authorization tokens.

- **→ imports `@supabase/supabase-js`**: 
  - **WHAT is imported**: Supabase client library for interacting with the Supabase backend.
  - **WHY it’s needed**: Used for managing user authentication and data storage.
  - **HOW it’s used**: Functions like `verifyToken` create a Supabase client for querying user information.

- **→ imports `crypto-js`**: 
  - **WHAT is imported**: Library for cryptographic functionalities.
  - **WHY it’s needed**: Provides methods for encrypting and decrypting tokens securely.
  - **HOW it’s used**: Used in `encryptToken` and `decryptToken` for securing sensitive data.

### For `backend_researcher/services/googleServices.js`
- **→ imports `nodemailer/lib/mail-composer/index.js`**: 
  - **WHAT is imported**: Module for composing emails.
  - **WHY it’s needed**: Enables the application to structure emails correctly before sending.
  - **HOW it’s used**: Utilized in email creation functions.

- **→ imports `backend_researcher/services/authServices.js`** (two imports):
  - **WHAT is imported**: Functions for encrypting and decrypting tokens.
  - **WHY it’s needed**: Ensures secure handling of access tokens when interacting with Google APIs.
  - **HOW it’s used**: Calls these functions during OAuth flow management.

- **→ imports `googleapis`**: 
  - **WHAT is imported**: Google API client library.
  - **WHY it’s needed**: Facilitates communication with Google services such as Gmail and Drive.
  - **HOW it’s used**: The `configureOAuth` function uses this library to set up OAuth2 for Google account integration.

## Inbound Dependencies
The files in this folder are commonly used by the following components in the application:
- **backend_researcher/queue/queueService.js**: Uses both `googleServices.js` and `authServices.js` for email-related functionalities and secure token management in background tasks.
- **backend_researcher/router/...**: Multiple routers including `inboxRouter`, `sendRouter`, and others utilize functions from these services for managing authentication flows and interacting with Google APIs.

## Data Flow
1. **Data Entry**: The data typically enters through user requests made to API endpoints, where routers call services to authenticate users, encrypt tokens, or initiate email actions.
2. **Data Transformation**: Within the services, the data is transformed through various processes like token generation, email composition, and OAuth2 procedure.
3. **Data Exit**: The output data, either success messages or emails, is sent back to the routers, which then provide the final response to the user or perform further actions based on the outcome.

## Key Patterns
- **Service Layer Pattern**: This folder employs a service layer architecture where business logic is encapsulated in service modules. This decouples the authentication and API interaction logic from the routing logic, enhancing testability and maintainability.
- **Environment Configuration Management**: The use of the `dotenv` library to load environment variables is consistent with best practices for managing sensitive configurations securely.
- **Token Handling Patterns**: The methods for encrypting, decrypting, and verifying tokens follow established security practices, ensuring safe user interactions.

---
## Relationship Map
### backend_researcher/services/authServices.js
```javascript
//External Library Imports
import OpenAI from "openai";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import CryptoJS from "crypto-js";

dotenv.config();

//Initialise OpenAI Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_JWT_ALGORITHM = process.env.SUPABASE_JWT_ALGORITHM;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const secretKey = process.env.GMAIL_SECRET_KEY;

const OPEN_AI = new OpenAI({
  apiKey: OPENAI_KEY,
});

//Encrypt Into Database
export function encryptToken(token) {
  try {
    const encryptedToken = CryptoJS.AES.encrypt(token, secretKey).toString();
    return encryptedToken;
  } catch {
    return;
  }
}

//Decrypt When Making Function Calls
export function decryptToken(token) {
  try {
    const bytes = CryptoJS.AES.decrypt(token, secretKey);
    const decryptedToken = bytes.toString(CryptoJS.enc.Utf8);
    return decryptedToken;
  } catch {
    return;
  }
}
```

**→ imports `openai`**  
Target pagerank: 0.0

**→ imports `dotenv`**  
Target pagerank: 0.0

**→ imports `jsonwebtoken`**  
Target pagerank: 0.0

**→ imports `@supabase/supabase-js`**  
Target pagerank: 0.0

**→ imports `crypto-js`**  
Target pagerank: 0.0

### backend_researcher/services/googleServices.js
```javascript
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { decryptToken } from "../services/authServices.js";
import { encryptToken } from "../services/authServices.js";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);
...
```

**→ imports `backend_researcher/services/authServices.js`**  
Target exports: encryptToken, decryptToken, generateEmbeddings, verifyToken  
Target pagerank: 0.040691

---

This structured documentation of the `backend_researcher/services/` folder provides comprehensive insights into its purpose, file functionalities, dependency relationships, and data flow, ensuring effective understanding for developers interacting with this component of the codebase.