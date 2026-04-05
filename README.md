# Palette Backend

Automates research internship outreach via Gmail draft creation, bulk sending, attachment handling, inbox sync, open tracking, and professor discovery via automated scraping.

## Tech Stack

Node.js (Express) | Supabase/Postgres | Redis + BullMQ | Gmail API | OpenAI Embeddings | Firecrawl

## Setup

```bash
make setup        # copies .env template, builds Docker images
vim API/.env      # fill in your values
make dev          # starts API + Redis
```

Or without Docker:

```bash
cd API
npm install
cp .env.example .env  # fill in your values
npm run dev            # requires Redis running locally
```

## Project Structure

```
API/
  index.js              # Express entry point
  router/               # Route handlers (auth, send, inbox, snippets, saved, reply, engagement, repository, storage, scraper)
  services/             # Business logic (auth, email, google, storage, scraper)
  queue/                # BullMQ queues & workers (send, draft, inbox, watch, scrape)
  schema/               # Zod validation schemas (auth, send, inbox, saved, reply, snippet, storage)
  scraper/              # University URL configs for professor scraping
  redis/                # Redis connection config
  supabase/             # Supabase client config
  tests/                # Jest test suite
docker-compose.yml      # API + Redis dev environment
Makefile                # Dev workflow automation
.github/workflows/      # CI/CD pipelines
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
| `/scraper` | Professor scraping ETL pipeline (trigger + status) |

## Professor Scraper (ETL Pipeline)

Scrapes Canadian university faculty pages using Firecrawl, deduplicates against existing data via a staging table, generates OpenAI embeddings, and inserts new professors into the Taishan table.

```
POST /scraper/trigger  →  enqueue scrape jobs for all configured universities
GET  /scraper/status   →  check queue job counts (waiting/active/completed/failed)
```

- Authenticated via `SCRAPER_CRON_SECRET` (separate from Supabase keys)
- Runs automatically every Sunday via GitHub Actions cron
- Can be triggered manually from GitHub Actions UI
- Configure target URLs in `API/scraper/universities.js`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT`, `CORS_ORIGIN` | Server config |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Supabase connection |
| `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_ALGORITHM` | JWT verification |
| `SUPABASE_CRON_SECRET` | Watch queue cron auth |
| `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` | Google OAuth |
| `GMAIL_SECRET_KEY` | AES encryption for stored Gmail tokens |
| `REDIS_HOST`, `REDIS_PORT` or `REDIS_URL` | Redis connection |
| `OPENAI_API_KEY` | Embeddings for professor search + scraper |
| `BACKEND_API_BASE` | Base URL for tracking pixel links |
| `PUBSUB_PUSH_AUDIENCE`, `PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL` | Gmail webhook verification |
| `FIRECRAWL_API_KEY` | Firecrawl API for professor scraping |
| `SCRAPER_CRON_SECRET` | Auth for scraper trigger endpoint |

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `test.yml` | Push/PR to `prerelease` (API changes) | Runs tests + coverage on Node 20.x & 22.x |
| `deploy.yml` | Push to `prerelease` (API changes, not README/CLAUDE.md) | Runs tests → triggers Render deploy |
| `scraper-cron.yml` | Weekly (Sunday midnight UTC) + manual | Triggers professor scraper endpoint |

## Testing

```bash
make test             # run all tests
make test-coverage    # run with coverage report
```

225 tests across 22 suites covering services, routes, schemas, and queue workers.

## Docker

```bash
make setup    # first time — build images, create .env
make dev      # start API + Redis
make logs     # tail logs
make restart  # rebuild API after code changes
make down     # stop everything
make clean    # nuke containers, volumes, images
```
