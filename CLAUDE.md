# CLAUDE.md - Palette Backend

## What is this?

Palette automates research internship outreach via Gmail. Students find professors, draft/send emails from templates, track opens, and manage their inbox — all through a Node.js (Express 5) API backed by Supabase, Redis/BullMQ, and the Gmail API.

## Project layout

```
API/
  index.js              # Express entry point
  router/               # Route handlers — thin, delegate to services
  services/             # Business logic (auth, email, google, storage)
  queue/                # BullMQ queues & workers (send, draft, inbox, watch, attachments, variableless)
  schema/               # Zod validation schemas
  redis/                # Redis/ioredis connection
  supabase/             # Supabase client config
  tests/                # Jest tests (unit + integration)
    setup/              # Test helpers: mockSupabase, mockRedis, mockGmail, testApp
    unit/               # Unit tests for schemas and services
    integration/        # Integration tests for routes and queue workers
```

## Development workflow

```bash
cd API
npm install
npm run dev           # nodemon
npm test              # jest (all tests)
npm run test:coverage # jest with coverage
```

- ES modules (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- Tests need `NODE_OPTIONS='--experimental-vm-modules'` (already in npm scripts).
- CI runs on Node 20.x and 22.x against the `prerelease` branch.

## Code principles — follow these strictly

### TDD (Test-Driven Development)
1. **Write the test first.** Before writing any new function, route, or worker, write a failing test that describes the expected behavior.
2. **Make it pass.** Write the minimal code to make the test green.
3. **Refactor.** Clean up only if needed, keeping tests green.
4. Never skip tests. Every new feature or bug fix must include tests. If fixing a bug, write a test that reproduces the bug first.

### Simplicity over cleverness
- Do the simplest thing that works. No premature abstractions, no "just in case" code.
- Three similar lines of code > a premature helper function.
- If a function does one thing, leave it as one function. Don't split it "for readability" unless it's genuinely hard to follow.
- Avoid adding layers (middleware, wrappers, base classes) until there's a clear, repeated need.

### Never over-engineer
- No feature flags, config objects, or plugin systems unless explicitly asked for.
- No "extensible" patterns (strategy, factory, builder) for one-off logic.
- Don't add error handling for impossible states. Trust internal code.
- Don't add types, docstrings, or comments to code you didn't change.
- If you're writing more infrastructure than business logic, stop and simplify.

### Existing patterns to follow
- **Routers** are thin: parse request, call service, return response. Keep them that way.
- **Services** contain business logic. They take plain objects, return plain objects.
- **Schemas** use Zod for validation. Keep schemas flat and straightforward.
- **Queue workers** follow the pattern: one queue file (exports the queue) + one worker file (processes jobs).
- **Tests** use mocks from `tests/setup/` (mockSupabase, mockRedis, mockGmail). Integration tests use `createTestApp()` from `testApp.js` + supertest.

### Testing conventions
- Test files live in `tests/unit/` or `tests/integration/` mirroring the source structure.
- Unit tests for schemas and services, integration tests for routes and workers.
- Coverage thresholds: 80% branches, 90% functions/lines/statements. Don't let coverage drop.
- Use the existing mock patterns — don't invent new mock strategies.

## Key dependencies

| Package | Purpose |
|---------|---------|
| express (v5) | HTTP framework |
| @supabase/supabase-js | Database (Postgres) |
| bullmq + ioredis | Job queues |
| googleapis | Gmail API |
| zod | Schema validation |
| mustache | Email template rendering |
| jsonwebtoken + bcrypt | Auth |
| openai + pgvector | Professor search embeddings |
| supertest + jest | Testing |

## Common tasks

- **Add a new route**: Create router in `router/<name>/`, add service in `services/`, write integration test first, then implement.
- **Add a queue worker**: Create `queue/<name>/Queue.js` and `queue/<name>/Worker.js`, write integration test first, import worker in `index.js`.
- **Add a schema**: Create in `schema/`, write unit test first with valid/invalid cases.
