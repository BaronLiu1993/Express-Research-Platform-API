# Palette Backend — API Documentation

An Express-based backend that supports discovering professors, generating email drafts, sending bulk outreach (with optional attachments), tracking engagement via pixels, and storing mail/message metadata in Supabase. It uses Gmail OAuth for sending and reading messages, Redis + BullMQ for background job processing, and Supabase/Postgres for persistence.

## Quick Overview
- **Primary purpose:** Automate research internship outreach via Gmail (draft creation, sending, attachments, inbox parsing, tracking).
- **Tech stack:** Node.js (Express), Supabase/Postgres, Redis + BullMQ, Google APIs (Gmail/Drive), OpenAI (embeddings), MailParser/Nodemailer utilities.

## Architecture & Flow
- Client authenticates with the backend and provides a Supabase JWT for API access.
- Background jobs are queued (draft generation, sending, sending-with-attachments, inbox processing) and processed by BullMQ workers.
- Drafts are created in the user's Gmail account, optionally updated with a tracking pixel, and then sent via the Gmail API.
- Metadata (draft ids, thread ids, messages, tracking ids, user profile file paths) is stored in Supabase tables such as `Emails`, `Messages`, `Track`, and `User_Profiles`.

## Project Layout (important files)
- `API/index.js`: Express app entry — mounts routers, sets up middleware and rate limiting, imports queue workers.
- `API/package.json`: Node dependencies and scripts.
- `API/router/`: Express route handlers (auth, send, inbox, snippets, saved, reply, engagement, repository, storage).
- `API/queue/`: Queue definitions and workers for `send`, `draft`, `variablelessDrafts`, `sendAttachments`, `inbox`, `watch`.
- `API/services/`: Business logic helpers: `authServices.js`, `googleServices.js`, `emailServices.js`, `storageServices.js`, etc.
- `API/redis/redis.js`: Redis connection configuration used by BullMQ.
- `API/supabase/supabase.js`: Supabase client configuration.

## Main Routers & Key Endpoints
Below are the primary mounted router paths and the most-used endpoints (summary):
- **`/auth`** — Authentication flows (login, token exchange, user profiles).
- **`/snippets`** — CRUD for email snippets/templates used to generate drafts.
- **`/email`** (`sendRouter`) — Draft creation and sending:
	- `POST /create-draft` — queue bulk snippet-driven draft creation
	- `POST /create-variableless-draft` — queue bulk HTML/subject drafts
	- `POST /send-draft` — queue sending of drafts
	- `POST /send-attachments-draft` — queue sending with resume/transcript attachments
	- `GET /get-drafts` — list drafts from Supabase
	- `GET /get-singular-draft` — fetch and parse a Gmail draft
	- `PUT /update-draft` — update a Gmail draft
	- `DELETE /delete-draft` — delete a Gmail draft and DB record
- **`/inbox`** — Inbox processing and message listing.
- **`/engagement`** — Tracking pixel endpoint that records opens (analyticId query param).
- **`/reply`** — Reply-handling and thread reply composition.
- **`/storage`** — File upload/download helpers (presigned URLs for attachments).

## Queues & Workers
- Implements background processing with BullMQ (Redis backend). Primary queues:
	- `draft` / `generate-draft`
	- `variablelessDrafts` / `generate-variableless-draft`
	- `send` / `send-email`
	- `sendAttachments` / `send-attachments-email`
	- `inbox` / inbox processing
	- `watch` / watchers for other events
- Workers live under `API/queue/*/*Worker.js` and call functions in `API/services/emailServices.js` and other services.

## Services Summary
- `authServices.js`: JWT verification middleware (`verifyToken`), token encrypt/decrypt helpers, OpenAI embeddings wrapper, request verification helpers for cron/pubsub.
- `googleServices.js`: Gmail/Drive OAuth configuration (`configureOAuth`), message body builders (`makeBody`, `makeReplyBody`) and helpers for decoding/encoding.
- `emailServices.js`: High-level email flows — create drafts from snippets, send drafts (with tracking pixel), manage DB records, and send with attachments.
- `storageServices.js`: Generate presigned URLs for resume/transcript assets used as attachments.

## Database / Supabase
- The backend uses Supabase (Postgres) to persist:
	- `User_Profiles` (gmail tokens, resume/transcript paths)
	- `Emails` (draft metadata, tracking ids)
	- `Messages` (message and thread metadata)
	- `Track` (tracking / thread mapping)

## Environment Variables
Set the following env vars (example names used in code):
- `PORT` — server port used by Express.
- `CORS_ORIGIN` — allowed front-end origin.
- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_ANON_KEY` — Supabase anon key used for client-like operations.
- `SUPABASE_JWT_SECRET` — JWT secret used to verify incoming Bearer tokens.
- `SUPABASE_JWT_ALGORITHM` — JWT algorithm (e.g., `HS256`).
- `SUPABASE_CRON_SECRET` — secret for scheduled/cron endpoints.
- `PUBSUB_PUSH_AUDIENCE` and `PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` — for verifying Pub/Sub push JWTs.
- `OPENAI_API_KEY` — OpenAI key for embeddings (if used).
- `BACKEND_API_BASE` — public API base URL used when generating tracking pixels.
- `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` — Google OAuth2 credentials.
- `GMAIL_SECRET_KEY` — AES secret used to encrypt Gmail access/refresh tokens in the DB.
- `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` — Redis connection for BullMQ.

## Running Locally
1. Install dependencies
```bash
cd API
npm install
```
2. Create a `.env` file with the environment variables above.
3. Start the server in dev mode
```bash
npm run dev
```

Notes:
- The project expects Redis (BullMQ) and Supabase to be reachable from the environment.
- Bulk endpoints limit queued recipients (server-side check: max 5 recipients per request).

## Docker
- There is a `API/Dockerfile` for containerizing the API. The image will still require environment variables and access to Redis and Supabase.

## Developer Notes & Important Behaviors
- Draft generation: drafts are created in the user's Gmail account (via OAuth) and stored as drafts in Gmail; a record is inserted into `Emails` with a generated `tracking_id`.
- Sending flow: the worker retrieves the draft, appends a tracking pixel that points at `${BACKEND_API_BASE}/engagement/hi.png?analyticId=<encrypted_tracking_id>`, updates and sends the draft via Gmail, then inserts `Messages` and `Track` records and deletes the draft row.
- Attachments: attachments (resume/transcript) are served via presigned URLs generated by `storageServices.js` and attached to outgoing mail when requested.
- Security: Gmail tokens are encrypted using `GMAIL_SECRET_KEY` before being stored in Supabase.

## Next steps you might want
- Add an OpenAPI/Swagger spec for the HTTP API.
- Add integration tests for queue processing and Gmail flows (requires test credentials).
- Provide a local `docker-compose.yml` to spin up Redis + a dev database for easier local testing.

---
If you want, I can also:
- extract a complete list of environment variables into a `.env.example` file,
- generate an OpenAPI/Swagger spec for the mounted routes, or
- open a deeper dive into one worker (for example `API/queue/send/sendWorker.js`).

**Components**
- Client (browser or external): interacts via REST endpoints protected by Supabase JWTs.
- Express API: mounts routers in `API/index.js`, applies CORS, rate limiting, cookie parsing, and initializes queue workers.
- Routers: logical HTTP endpoints grouped by domain (auth, email/send, inbox, snippets, reply, engagement, storage).
- Services: central business-logic modules (`authServices`, `googleServices`, `emailServices`, `storageServices`) that encapsulate OAuth flows, Gmail operations, DB operations, and message construction.
- Queues & Workers: BullMQ + Redis to offload heavy or long-running tasks (bulk draft creation, sending, inbox parsing). Workers call into the same `services` layer.
- Supabase (Postgres): persistent store for user profiles, tokens, emails, messages, tracking.
- Google APIs: Gmail for drafts/messages, Drive for file downloads (attachments).
- OpenAI: embeddings for semantic vectoring (optional/auxiliary).

**Data / Request Flow (typical example: send a bulk email)**
1. Client requests `POST /email/create-draft` or `POST /email/send-draft` with recipients and payload.
2. Express router validates JWT via `verifyToken` and enqueues jobs into BullMQ (limit checks applied at router level).
3. BullMQ stores jobs in Redis; a `sendWorker` picks up jobs and executes them concurrently.
4. Worker uses `emailServices` + `googleServices` to:
	 - fetch draft metadata from Supabase (or create draft in Gmail)
	 - build raw MIME with `makeBody`
	 - add tracking pixel referencing `${BACKEND_API_BASE}/engagement/hi.png?analyticId=<encrypted_id>`
	 - update/send the draft via Gmail API
	 - insert `Messages`/`Track` records in Supabase and remove draft rows from `Emails`
5. Client can query `GET /email/get-drafts` or inbox endpoints to view state stored in Supabase.

**Queue Design & Resilience**
- Jobs are idempotent where feasible; workers log and re-throw for retry handling.
- Workers have concurrency & per-worker rate limiting (see `sendWorker` limiter options).
- Redis connection is configured with retry/backoff strategies in `API/redis/redis.js`.
- Consider adding a dead-letter queue (DLQ) for persistent failures and alerting on high failure rates.

**Scaling & Performance**
- Horizontal scale: API server can be replicated behind a load balancer. Use sticky sessions only if necessary; prefer stateless JWT flows.
- Workers: scale independently; add more worker instances for throughput (ensure Gmail quota and rate limits are respected).
- Redis & Supabase are external managed services that should be scaled vertically/horizontally as needed.
- Consider batching DB writes (when safe) for high throughput flows.

**Security**
- Gmail access/refresh tokens are AES-encrypted at rest using `GMAIL_SECRET_KEY`.
- API requests require a Supabase JWT verified with `SUPABASE_JWT_SECRET` and `SUPABASE_JWT_ALGORITHM`.
- Rate limiting at the API layer reduces abuse (`express-rate-limit`).
- Tracking pixel analyticId is encrypted before placing in URLs to avoid exposing raw identifiers.
- Limit bulk operations (server enforces max 5 recipients per request) to reduce abuse and quota exhaustion.

**Observability & Monitoring**
- Add structured logging for job lifecycle events (enqueue, start, completed, failed). Workers already log these events.
- Export metrics (job queue lengths, job failures, worker throughput, Redis health) to Prometheus or a hosted monitoring service.
- Instrument external calls (Gmail, Supabase) with request timing and errors; use centralized traces if available.

**Deployment Recommendations**
- Provide a `docker-compose.yml` for local dev (Express app + Redis + Postgres) or containerized deployments per-service.
- Production: run API in a container/orchestrator (Kubernetes, ECS) with environment variables configured via secrets manager.
- Use managed Redis (e.g., Redis Labs, AWS ElastiCache) and managed Postgres (Supabase/Cloud SQL) for reliability.

**Local Development Checklist**
1. Start Redis locally (or point to `REDIS_URL`).
2. Provide a Supabase dev instance and populate required tables (User_Profiles, Emails, Messages, Track).
3. Create a `.env` with Google OAuth credentials and `GMAIL_SECRET_KEY`.
4. Run `npm install` and `npm run dev` in `API/`.


