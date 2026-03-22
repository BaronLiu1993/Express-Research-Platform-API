# CLAUDE.md - Tests

## Test structure

- `unit/` — Pure logic tests (schemas, services). No HTTP, no app instance.
- `integration/` — Route and worker tests. Use `createTestApp()` from `setup/testApp.js` + supertest.
- `setup/` — Shared mocks and helpers. Use these, don't create new mock strategies.

## Mocks

| File | What it mocks |
|------|---------------|
| `mockSupabase.js` | Supabase client — chainable `.from().select().eq().range()...` |
| `mockRedis.js` | Redis/ioredis connection + BullMQ Queue/Worker |
| `mockGmail.js` | Gmail API (`googleapis`) |
| `testApp.js` | Creates a minimal Express app for route testing |
| `globalSetup.js` | Sets `NODE_ENV=test` and all required env vars before suites run |
| `silenceConsole.js` | Mocks `console.log/error/warn` to keep test output clean |

## Mock chain pattern

When mocking Supabase chainable queries, include all methods the route uses:
```js
const mockChain = {
  from: jest.fn(), select: jest.fn(), insert: jest.fn(),
  update: jest.fn(), delete: jest.fn(), eq: jest.fn(),
  in: jest.fn(), order: jest.fn(), range: jest.fn(),
  single: jest.fn(),
};
```
Reset with: `Object.values(mockChain).forEach((fn) => { if (typeof fn?.mockReturnValue === "function") fn.mockReturnValue(mockChain); });`

Set `mockChain.then` for awaited chains, `mockChain.single.mockResolvedValue()` for `.single()` calls.

## Rules

- **TDD**: Write the test first, then the code. Every PR must include tests.
- **Use existing mocks**: Don't create parallel mock systems. Extend the ones in `setup/` if needed.
- **Keep tests simple**: One behavior per test. Descriptive test names.
- **Coverage thresholds**: 65% across all metrics. Enforced in `jest.config.js`.
- **ESM mocking**: Use `jest.unstable_mockModule()` before dynamic `import()` — standard `jest.mock()` doesn't work with ES modules.
- **Case sensitivity**: Import paths must match exact file name casing (Linux CI is case-sensitive, macOS is not).
- **No test-only utilities**: If you need a helper, put it in `setup/`.
