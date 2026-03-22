# CLAUDE.md - API

This is the Express API server. See the root CLAUDE.md for full project context.

## Architecture

Request flow: `Router -> Zod Schema Validation -> Service -> Supabase/Gmail/Redis`

- Routers validate input with Zod `safeParse`, extract auth (JWT), and call services. Keep routers thin.
- Services do the actual work: Gmail API calls, Supabase queries, token handling. They return plain `{ message, completed/success }` objects.
- Queues handle async work: sending emails, creating drafts, syncing inbox, watching for new mail, scraping professors.

## Auth flow

- Google OAuth with `gmail.modify` scope -> tokens encrypted with AES (GMAIL_SECRET_KEY) and stored in Supabase.
- JWT issued on login, verified on each request via `verifyToken` middleware.
- Supabase client created per-request with the user's JWT in the Authorization header (RLS).
- Scraper endpoint uses separate `SCRAPER_CRON_SECRET` via `x-cron-secret` header (no user JWT needed).

## Scraper (ETL Pipeline)

- `POST /scraper/trigger` — authenticated with `SCRAPER_CRON_SECRET`, enqueues scrape jobs for all URLs in `scraper/universities.js`
- Uses Firecrawl `extract()` API to pull structured professor data from faculty pages
- Dedupes in-memory by checking emails against existing Taishan records
- Validates rows: must have name + email + at least one of bio/research_interests
- Generates OpenAI embeddings for new professors before inserting

## Testing

```bash
npm test                            # all tests
npm test -- --testPathPattern=send  # run tests matching "send"
npm run test:coverage               # with coverage report
```

Tests mock external dependencies (Supabase, Gmail, Redis) — see `tests/setup/`. Console output is silenced via `tests/setup/silenceConsole.js`.

## File naming conventions

- Routers: `router/<domain>/<domain>Router.js` (camelCase with capital R — case matters on Linux!)
- Services: `services/<domain>Services.js`
- Schemas: `schema/<domain>Schema.js`
- Queues: `queue/<domain>/<domain>Queue.js` + `queue/<domain>/<domain>Worker.js`
- Tests: `tests/{unit,integration}/<layer>/<name>.test.js`

## Zod v4 gotchas

- `z.record()` and `z.object({}).passthrough()` crash at runtime — use `z.any()` for free-form objects
- `z.union()` with `.optional().default()` can cause `_zod` errors — keep unions simple
