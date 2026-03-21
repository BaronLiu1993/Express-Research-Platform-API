# CLAUDE.md - API

This is the Express API server. See the root CLAUDE.md for full project context.

## Architecture

Request flow: `Router -> Service -> Supabase/Gmail/Redis`

- Routers validate input (via Zod schemas), extract auth (JWT from cookies), and call services. Keep routers thin.
- Services do the actual work: Gmail API calls, Supabase queries, token handling. They return plain `{ message, completed/success }` objects.
- Queues handle async work: sending emails, creating drafts, syncing inbox, watching for new mail.

## Auth flow

- Google OAuth -> tokens encrypted with AES (GMAIL_SECRET_KEY) and stored in Supabase.
- JWT issued on login, sent via httpOnly cookie, verified on each request.
- Supabase client created per-request with the user's JWT in the Authorization header (RLS).

## Testing

```bash
npm test                          # all tests
npm test -- --testPathPattern=send  # run tests matching "send"
npm test -- --coverage            # with coverage report
```

Tests mock external dependencies (Supabase, Gmail, Redis) — see `tests/setup/`. Always use these existing mocks rather than creating new ones.

### TDD checklist for this codebase
1. Write test in `tests/unit/` or `tests/integration/` (match the source path)
2. Run it — confirm it fails
3. Write minimal code to pass
4. Run full suite — confirm nothing else broke
5. Refactor only if needed

## File naming conventions

- Routers: `router/<domain>/<domain>Router.js`
- Services: `services/<domain>Services.js`
- Schemas: `schema/<domain>Schema.js`
- Queues: `queue/<domain>/<domain>Queue.js` + `queue/<domain>/<domain>Worker.js`
- Tests: `tests/{unit,integration}/<layer>/<name>.test.js`
