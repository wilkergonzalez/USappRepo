# CHANGED.md

This file is the human-readable change ledger for the project.
Agents should update it whenever they make or verify a meaningful change.

## Latest status
- [x] Planner, security architect, QA architect, coder, and release reviewer completed the hardening review
- [x] Feature work isolated on `feat/prototype-auth-ci-hardening`
- [x] Mobile typecheck now runs through a real package script with TypeScript 5.9.3
- [x] Admin lint is included and passes locally
- [x] Deterministic hardening contract tests added and passing (7 tests)
- [x] Mobile Supabase auth uses explicit persistent storage and auth-state refresh wiring
- [x] Admin review RPC now uses the authenticated caller context instead of a service-role RPC session
- [x] Supabase hardening migration added for profile, submission, storage, and function-execution boundaries
- [x] Admin production build passes locally
- [ ] Apply and exercise the new migration against the connected Supabase project
- [ ] Run live RLS/storage/auth integration tests with separate user and admin accounts
- [ ] Final reviewer approval and merge decision

## Files intentionally not tracked
- `apps/mobile/.env.local`
- `apps/admin/.env.local`
- `.env.local` if created later

## What changed so far
- Added a 4-agent planning workflow using the `4Agent.txt` guide.
- Implemented the Supabase-ready prototype increment with mobile/admin data access layers and verification workflow.
- Kept the mobile prototype and admin dashboard as separate surfaces.

## What still needs to happen
- Wire the mobile app to Supabase auth and state.
- Wire the admin queue to live verification data.
- Add the GitHub workflow / branch process so changes are easy to review.
- Commit and push only tracked files; secrets must stay in ignored env files.
