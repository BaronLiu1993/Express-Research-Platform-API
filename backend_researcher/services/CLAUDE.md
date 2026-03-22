# CLAUDE.md - Documentation for `backend_researcher/services/`

## Purpose
The **services** folder within the `backend_researcher` architecture is designed to encapsulate the core business logic and external API interactions including user authentication, email processing, and token management related to the research email handling system. If this folder were deleted, the application would lose its functionality for handling user credentials, encrypting and decrypting tokens, as well as interfacing with essential services like Google APIs and Supabase. This would essentially make user authentication and email functionalities inoperable, resulting in a non-functional application.

In the architecture, the services folder acts as an intermediary layer between the **router** folder, which deals with handling incoming requests, and the **queue** and **redis** folders, which manage the asynchronous tasks and queuing mechanisms. Thus, it plays a vital role in orchestrating the flow of data and business logic.

## Files

### 1. `authServices.js`
- **What it does**: This file provides important functions for user authentication, token encryption/decryption, and generating embeddings using the OpenAI API.
- **Exports**: `encryptToken`, `decryptToken`, `generateEmbeddings`, `verifyToken`.
- **PageRank**: `0.040691` - high importance as it handles central authentication roles.
- **Why it matters**: Essential for managing user security and access rights, ensuring that user tokens are maintained safely, and facilitating communication with external APIs like OpenAI.

### 2. `googleServices.js`
- **What it does**: This file encapsulates services for interacting with Google APIs, particularly for email and file retrieval using Gmail and Google Drive.
- **Exports**: `decodeBody`, `configureOAuth`, `getDriveFileBuffer`, `extractHtmlOrPlainText`.
- **PageRank**: `0.013758` - moderate importance as it enables connection with Gmail and Drive.
- **Why it matters**: Allows the application to securely connect to Google’s services for fetching and sending emails, which is crucial for the email handling and research automation processes.

## Dependency Map

### 1. `authServices.js`
- **`openai`** → `OpenAI`: Imports the library to utilize the OpenAI API for generating embeddings; essential for the research input processing.
- **`dotenv`** → `dotenv`: Loads environment variables for API keys and secrets; essential for configuration management.
- **`jsonwebtoken`** → `jwt`: Provides functionality for signing and verifying JWT tokens, crucial for authentication.
- **`@supabase/supabase-js`** → `createClient`: Facilitates interactions with the Supabase service for user data management; essential for integrating database functionalities.
- **`crypto-js`** → `CryptoJS`: Used for encrypting and decrypting tokens, which secures sensitive user information.

### 2. `googleServices.js`
- **`MailComposer`** → `MailComposer`: A part of the Nodemailer library used for creating email messages in the proper format for Gmail.
- **`decryptToken`** → `decryptToken`: Imports a utility function to decode tokens when making API requests.
- **`encryptToken`** → `encryptToken`: Imports a utility function for encrypting tokens before they are stored, maintaining security.
- **`google`** → `google`: Imports the Google APIs client library to interact with Gmail and Drive for email and file management; essential for core functionalities.

## Inbound Dependencies
- **`backend_researcher/queue/queueService.js`**: Utilizes functions from **Google Services** for sending and retrieving email.
- **`backend_researcher/router/auth/authRouter.js`**, **`backend_researcher/router/send/sendRouter.js`**, and others: Rely on **Auth Services** for handling authentication and token management throughout the routing processes.
- **`backend_researcher/router/inbox/draftRouter.js`**: Depends on Google Services for operations related to draft emails and their management.

## Data Flow
1. **Data Entry**: Incoming requests trigger authentication and quota management through the routers, specifically invoking the services for tasks like token verification or email sending.
2. **Service Layer Processing**: The relevant function from either `authServices.js` or `googleServices.js` is called, performing necessary encryption, decryption, or API interactions.
3. **Asynchronous Handling**: For operations involving sending emails, the data gets queued using a separate service that handles sending asynchronously, relying on Redis.
4. **Data Exit**: The service returns the response back through the router, sending the final response to the client, indicating success or failure of the performed operations.

## Key Patterns
- **Modular Functionality**: Both service files are organized to encapsulate related functionalities, enhancing manageability and allowing focused updates.
- **Error Handling**: Both files implement try-catch blocks for error handling to return descriptive messages and enhance resilience in operations.
- **Secure Token Management**: Both files emphasize security by using encrypted tokens for sensitive data exchanges, preventing unauthorized access.

This structured documentation outlines the purpose and functionality of the `backend_researcher/services` folder. By providing detailed insights into each file, its importance, dependencies, data flow, and conventions used, it equips development and maintenance teams with the necessary context for effective management of the codebase.