# CHANGED.md

This file is the human-readable change ledger for the project.
Agents should update it whenever they make or verify a meaningful change.

## Latest status
- [x] Planner agent wrote the next implementation spec to `.pipeline/spec.md`
- [x] Supabase project URL and keys stored locally in ignored `.env.local` files
- [x] Secrets were kept out of tracked files
- [x] Coder agent finished the Supabase-backed implementation
- [x] Tester agent ran verification against the new implementation
- [x] Reviewer agent completed the final review
- [x] GitHub Actions CI workflow added at `.github/workflows/ci.yml`
- [ ] GitHub remote / repository pipeline finalized

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
