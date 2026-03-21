# CLAUDE.md - Tests

## Test structure

- `unit/` — Pure logic tests (schemas, services). No HTTP, no app instance.
- `integration/` — Route and worker tests. Use `createTestApp()` from `setup/testApp.js` + supertest.
- `setup/` — Shared mocks and helpers. Use these, don't create new mock strategies.

## Mocks

| File | What it mocks |
|------|---------------|
| `mockSupabase.js` | Supabase client — chainable `.from().select().eq()...` |
| `mockRedis.js` | Redis/ioredis connection |
| `mockGmail.js` | Gmail API (`googleapis`) |
| `testApp.js` | Creates a minimal Express app for route testing |
| `globalSetup.js` | Runs before all test suites |

## Rules

- **TDD**: Write the test first, then the code. Every PR must include tests.
- **Use existing mocks**: Don't create parallel mock systems. Extend the ones in `setup/` if needed.
- **Keep tests simple**: One behavior per test. Descriptive test names. No complex setup when a simple one works.
- **Coverage thresholds**: 80% branches, 90% functions/lines/statements. These are enforced in `jest.config.js`.
- **No test-only utilities**: If you need a helper, put it in `setup/`. Don't create helpers in test files that other test files import.
