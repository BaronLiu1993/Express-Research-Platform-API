# Palette Backend

Automates research internship outreach via Gmail — draft creation, bulk sending, attachment handling, inbox sync, and open tracking.

## Tech Stack

Node.js (Express) | Supabase/Postgres | Redis + BullMQ | Gmail API | OpenAI Embeddings

## Setup

```bash
cd API
npm install
cp .env.example .env  # fill in your values
npm run dev
```

Requires Redis and Supabase to be reachable.

## Project Structure

```
API/
  index.js              # Express entry point
  router/               # Route handlers (auth, send, inbox, snippets, saved, reply, engagement, repository, storage)
  services/             # Business logic (auth, email, google, storage)
  queue/                # BullMQ queues & workers
  schema/               # Zod validation schemas
  redis/                # Redis connection config
  supabase/             # Supabase client config
  tests/                # Jest test suite
```

## API Routes

| Mount | Purpose |
|-------|---------|
| `/auth` | Google OAuth, JWT auth, user registration & profiles |
| `/email` | Draft CRUD, bulk send, send with attachments (max 5 per request) |
| `/inbox` | Gmail webhook, thread listing, email viewing |
| `/snippets` | Email template CRUD, variable syncing |
| `/saved` | Professor kanban board (save, remove, status) |
| `/repository` | Professor search (keyword + embeddings) and matching |
| `/engagement` | Tracking pixel for email open detection |
| `/reply` | Send replies within existing threads |
| `/storage` | Presigned URLs for resume/transcript upload & download |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT`, `CORS_ORIGIN` | Server config |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Supabase connection |
| `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_ALGORITHM` | JWT verification |
| `SUPABASE_CRON_SECRET` | Cron endpoint auth |
| `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` | Google OAuth |
| `GMAIL_SECRET_KEY` | AES encryption for stored Gmail tokens |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` | Redis connection |
| `OPENAI_API_KEY` | Embeddings for professor search |
| `BACKEND_API_BASE` | Base URL for tracking pixel links |
| `PUBSUB_PUSH_AUDIENCE`, `PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` | Gmail webhook verification |

## Testing

```bash
npm test                # run all tests
npm run test:coverage   # run with coverage report
```

225 tests across 22 suites covering services, routes, schemas, and queue workers.

## Docker

```bash
docker build -t palette-api ./API
docker run -p 8080:8080 --env-file .env palette-api
```

Requires external Redis and Supabase access.

