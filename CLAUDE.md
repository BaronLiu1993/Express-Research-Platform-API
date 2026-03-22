# CLAUDE.md - Palette Backend

## What is this?

Palette automates research internship outreach via Gmail. Students find professors, draft/send emails from templates, track opens, and manage their inbox — all through a Node.js (Express 5) API backed by Supabase, Redis/BullMQ, and the Gmail API. Includes an automated professor scraper that crawls Canadian university faculty pages via Firecrawl.

## Project layout

```
API/
  index.js              # Express entry point
  router/               # Route handlers (auth, send, inbox, snippets, saved, reply, engagement, repository, storage, scraper)
  services/             # Business logic (auth, email, google, storage, scraper)
  queue/                # BullMQ queues & workers (send, draft, inbox, watch, attachments, variableless, scrape)
  schema/               # Zod validation schemas (auth, send, inbox, saved, reply, snippet, storage)
  scraper/              # University URL configs for professor scraping
  redis/                # Redis/ioredis connection
  supabase/             # Supabase client config
  tests/                # Jest tests (unit + integration)
    setup/              # Test helpers: mockSupabase, mockRedis, mockGmail, silenceConsole, testApp
    unit/               # Unit tests for schemas and services
    integration/        # Integration tests for routes and queue workers
docker-compose.yml      # Redis dev environment
Makefile                # Dev workflow automation
.github/workflows/      # CI (test.yml), CD (deploy.yml), cron (scraper-cron.yml)
```

## Development workflow

```bash
make setup            # first time: copy .env template, install deps
make dev              # start Redis (Docker) + API (nodemon with hot reload)
make test             # run tests
make test-coverage    # run tests with coverage
make down             # stop Redis
```

- ES modules (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- Tests need `NODE_OPTIONS='--experimental-vm-modules'` (already in npm scripts).
- CI runs on Node 20.x and 22.x against the `prerelease` branch.
- CD deploys to Render after tests pass (skips README/CLAUDE.md changes).
- Professor scraper runs weekly via GitHub Actions cron.

## Code principles — follow these strictly

### TDD (Test-Driven Development)
1. **Write the test first.** Before writing any new function, route, or worker, write a failing test that describes the expected behavior.
2. **Make it pass.** Write the minimal code to make the test green.
3. **Refactor.** Clean up only if needed, keeping tests green.
4. Never skip tests. Every new feature or bug fix must include tests.

### Simplicity over cleverness
- Do the simplest thing that works. No premature abstractions.
- Three similar lines of code > a premature helper function.
- Don't add layers (middleware, wrappers, base classes) until there's a clear, repeated need.

### Never over-engineer
- No feature flags, config objects, or plugin systems unless explicitly asked for.
- Don't add error handling for impossible states. Trust internal code.
- Don't add types, docstrings, or comments to code you didn't change.

### Existing patterns to follow
- **Routers** are thin: validate with Zod, call service, return response.
- **Services** contain business logic. They take plain objects, return plain objects.
- **Schemas** use Zod for validation. Use `z.any()` for free-form objects (Zod v4 has issues with `z.record()` and `.passthrough()`).
- **Queue workers** follow the pattern: one queue file + one worker file. Guard `console.error` in catch blocks with `process.env.NODE_ENV !== "test"`.
- **Tests** use mocks from `tests/setup/`. Integration tests use `createTestApp()` + supertest.

### File naming conventions
- Routers: `router/<domain>/<domain>Router.js` (camelCase, capital R)
- Services: `services/<domain>Services.js`
- Schemas: `schema/<domain>Schema.js`
- Queues: `queue/<domain>/<domain>Queue.js` + `queue/<domain>/<domain>Worker.js`
- Tests: `tests/{unit,integration}/<layer>/<name>.test.js`

**Important**: Linux (CI/Render) is case-sensitive. Always match file name casing exactly in imports.

## Key dependencies

| Package | Purpose |
|---------|---------|
| express (v5) | HTTP framework |
| @supabase/supabase-js | Database (Postgres) |
| bullmq + ioredis | Job queues |
| googleapis | Gmail API |
| zod (v4) | Schema validation |
| mustache | Email template rendering |
| jsonwebtoken + bcrypt | Auth |
| openai + pgvector | Professor search embeddings |
| @mendable/firecrawl-js | Professor scraping |
| supertest + jest | Testing |

## Common tasks

- **Add a new route**: Create router in `router/<name>/`, add schema in `schema/`, add service in `services/`, write integration test first, then implement. Wire into `index.js`.
- **Add a queue worker**: Create `queue/<name>/<name>Queue.js` and `queue/<name>/<name>Worker.js`, write integration test first, import worker in `index.js`.
- **Add a schema**: Create in `schema/`, write unit test first with valid/invalid cases. Use `z.any()` for flexible object fields.
- **Add a university to scraper**: Edit `API/scraper/universities.js` — add an entry with school, faculty, department, and URL.
