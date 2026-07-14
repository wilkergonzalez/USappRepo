# CHANGED.md

This file is the human-readable change ledger for the project.

## Current status
- [x] Supabase auth, verification, storage, RLS, and admin-review hardening is merged to `main`
- [x] Local demo launchers are implemented on `feat/local-demo-runnable`
- [x] `npm test` passes 13 deterministic tests
- [x] Admin lint and production build pass locally
- [x] Mobile TypeScript typecheck passes after the app-local dependency install
- [x] Root admin and mobile commands pass browser smoke checks with dummy data
- [x] Combined `npm run demo` works with alternate ports and cleans up child processes
- [x] Invalid/duplicate demo ports fail before child startup
- [ ] Final review and merge of `feat/local-demo-runnable`
- [ ] Apply and exercise Supabase migrations against the connected project
- [ ] Run live RLS/storage/auth integration tests with separate user and admin accounts
- [ ] Add government data/bill APIs after the user provides credentials and approves the next scope
- [ ] Add third-party identity verification only in a separately approved phase

## Local demo commands
```bash
npm install
npm run demo
```

Default URLs:
- Admin: http://127.0.0.1:3000
- Mobile web: http://localhost:8081 (or the Expo URL printed by the launcher)

Use `npm run admin -- --port 3001 --hostname 127.0.0.1` and
`npm run mobile:web -- --port 8083` when a default port is occupied.

## Secrets and environment
- `apps/mobile/.env.local` is intentionally ignored.
- `apps/admin/.env.local` is intentionally ignored.
- Supabase variables are optional for local demo mode.
- No credentials, government APIs, or third-party verification integrations were added in this increment.

## Workflow
- Continue using planner → coder → tester → read-only reviewer.
- Keep changes on feature branches and merge only after reviewer approval.
- Keep this ledger aligned with verified repository state.
