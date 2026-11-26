# US: The People — conversation handoff context

> CONTEXT ONLY. This is a condensed record of the owner's conversation with Hermes, not an approved implementation plan, a complete specification, or an instruction to execute every item automatically. A follow-on agent should split the unresolved items into small, testable problems, check the current repo/runtime/source terms, and obtain the owner's decisions before live database writes, paid API use, account changes, or publication. Never treat historical test results as proof that an API still works today.

## Owner's goal and preferences

Build the Utah pilot of a civic app showing federal/Utah bills, officials and their votes, district matching, and eventually reviewed AI summaries. The owner wants research agents, a database for importable data, real free-API tests, ongoing progress notes in `Desktop/USAPP`, and plain-language explanations of exactly what the owner needs to provide. The owner later asked to run the iOS/Android emulators and fix startup errors. Work should be observable and honest: do **not** impersonate humans, conceal automation, evade blocks, scrape where an API exists, or exceed rate limits. Stop on 429/403 and report blockers. No persistent agent/cron service was set up; the four research/build agents and the independent reviewer finished their bounded tasks.

## Locations and current repo state

- This file was copied from the working source into `/Users/wilkergonzalez/Desktop/testapp/Untitled/USappRepo`. The research/status/staging references below point to the original `/Users/wilkergonzalez/Desktop/USAPP` workspace, not this copy's parent directory.
- Working source repo: `/Users/wilkergonzalez/Desktop/USAPP/USappRepo` (local branch `feat/data-sources-spike`; as last checked, the emulator fixes below were uncommitted and nothing from this spike was pushed). The copied target is on `main` with its own newer commit/history; the application source files were identical at comparison time, while package/config files needed merging.
- Original source runbook: `/Users/wilkergonzalez/Downloads/US The People — Data Source Runbook for Agents.md`. **It has a plaintext credentials appendix. Do not copy, commit, quote, or share that appendix.** Read the substantive runbook and PRD for exact scope, endpoints, source limits and acceptance criteria; redact credentials in any derived material.
- Local workspace index: `/Users/wilkergonzalez/Desktop/USAPP/README.md`; simple owner checklist: `/Users/wilkergonzalez/Desktop/USAPP/NEXT_STEPS.md`; independent review: `/Users/wilkergonzalez/Desktop/USAPP/REVIEW.md`; emulator report: `/Users/wilkergonzalez/Desktop/USAPP/EMULATOR_STATUS.md` (absolute paths to the original workspace).
- Research and call logs: `/Users/wilkergonzalez/Desktop/USAPP/research/federal/`, `/Users/wilkergonzalez/Desktop/USAPP/research/utah/`, `/Users/wilkergonzalez/Desktop/USAPP/research/districts/`; agent progress: `/Users/wilkergonzalez/Desktop/USAPP/status/`.
- Corrected **local-only** SQLite staging: `/Users/wilkergonzalez/Desktop/USAPP/staging/staging.sqlite3`; importer/schema/tests: `/Users/wilkergonzalez/Desktop/USAPP/staging/importer.py`, `/Users/wilkergonzalez/Desktop/USAPP/staging/adapt_samples.py`, `/Users/wilkergonzalez/Desktop/USAPP/staging/schema.sql`, `/Users/wilkergonzalez/Desktop/USAPP/staging/test_importer.py`; reviewed input bundles: `/Users/wilkergonzalez/Desktop/USAPP/staging/corrected/`; contract and proposed Supabase schema: `/Users/wilkergonzalez/Desktop/USAPP/staging/README.md`.
- `/Users/wilkergonzalez/Desktop/USAPP/staging/reviewed/` and `/Users/wilkergonzalez/Desktop/USAPP/staging/staging-original-2026-11-03.sqlite3` are **flawed historical backups**, not import sources. The original overlarge Utah roster was removed after owner approval; `/Users/wilkergonzalez/Desktop/USAPP/research/utah/roster-subset.json` remains.
- `USappRepo/.env.local` is git-ignored and owner-only; it holds two existing government API keys. It does **not** have populated Supabase URL/anon variables in this clone. Do not expose values, use government keys in Expo/public env vars, or paste credentials into chat. App-specific `.env.local` files were absent when last checked.

## What was actually done and verified

1. Cloned the public repo onto a local feature branch. Four parallel agents read the runbook and repo, tested sources sparsely, saved sanitized samples/call ledgers, and built an offline importer. An independent read-only review then identified provenance and importer defects. Research artifacts remain outside Git; `docs/data-sources/FINDINGS.md`, `CHANGED.md` update, `data-samples/`, and `scripts/data-spike/` have **not** been assembled into the repo or committed.
2. Congress.gov API worked with the provided key for 119th Congress bill list/detail, summaries/actions/subjects/text, Utah members, and a House roll call. Four congress-legislators JSON files worked. Six Utah congressional members (2 senators, 4 representatives) resolved to bioguide IDs. The specific House roll 74 has four Utah positions in `/Users/wilkergonzalez/Desktop/USAPP/research/federal/congress-house-ut-votes.json`, but **no member-vote rows were staged** because the first-five-member bundle omitted them and the official crosswalk was incomplete. Senate roll-call XML returned HTTP 403; do not retry to bypass the denial. See `/Users/wilkergonzalez/Desktop/USAPP/research/federal/FINDINGS.md` and redacted `calls.json`.
3. Utah Legislature's official API returned 11 HTTP 200 responses: legislators, 2026GS bill list and five details, passed list, 2027GS file list, committees and meeting calendar. Live roster had **103 (74 House, 29 Senate)**, not the runbook's expected 104; investigate rather than inventing an official. Bill list had 1,016 entries. Exact observed paths, sponsor/action fields and caveats: `/Users/wilkergonzalez/Desktop/USAPP/research/utah/MAPPING.md`. Do not repeatedly fetch restricted roster/list/calendar endpoints.
4. Four public-building addresses in the runbook matched in Census geocoder results and Utah's **public ArcGIS polygon layers** across old/new congressional and 2026 Utah legislative maps. These polygons were queried using **Census-derived points**; this was not independent UGRC keyed address geocoding. See `/Users/wilkergonzalez/Desktop/USAPP/research/districts/FINDINGS.md` and `comparison.csv`. The keyed UGRC API, LegiScan, Open States and Geocodio were **not** tested with keys, because none were available for them.
5. Corrected local SQLite holds **21 source records, 6 bills (1 federal/5 Utah), 10 officials (5 federal/5 Utah), 1 House roll call, 0 member votes, 4 district identifiers, 0 synthetic rows**. The review fix changed district provenance to the actual public ArcGIS layer endpoints, left unverified Utah `serviceStart` values out of `term_start`, accepted the sanitized roster subset, and hardened importer checks for unreviewed source paths and common credential-shaped values. Sixteen importer tests passed, idempotent reimport preserved counts, SQLite integrity was `ok`, and foreign-key check had no errors. Secret checks are defense in depth, **not** a substitute for human review. No Supabase migration or live data import occurred.
6. Emulator repair: mobile Expo 57 dependencies were misaligned; locally updated Expo to 57.0.31, React Native to 0.86.3, related Expo modules, and TypeScript to 6.0.3 using Expo's installer. This modified `apps/mobile/package.json`, `apps/mobile/app.json` and root `package-lock.json`. A root-owned generated admin `.next/cache` caused EACCES; it was preserved outside the repo at `/Users/wilkergonzalez/Desktop/USAPP/backups/admin-next-root-owned-backup`, and `apps/admin/next.config.ts` now pins Turbopack root to this repo. `npm run ios` and `npm run android` opened the **Expo Go demo** in iPhone and Android emulators; iOS/Android/web bundles exported successfully. Mobile typecheck, admin lint/build and all 18 repo tests passed. This does **not** establish that a native iOS build works or that real account data is connected. See `/Users/wilkergonzalez/Desktop/USAPP/EMULATOR_STATUS.md`.

## What remains unresolved — candidate problems to split and prioritize

### Security, access, owner decisions

- Owner must rotate the passwords/API keys exposed in the downloaded runbook, move them to a password manager, replace the two rotated values in ignored `.env.local`, and remove the plaintext appendix from any copy shared with others. Never put secrets in this file, Git or chat. Audit any future commit for secret leakage.
- Decide whether the public GitHub repo should stay public or become private **before pushing**. Do not commit research artifacts until small samples, licensing/attribution and privacy are reviewed.
- Identify the owner's original Supabase project and safely connect the app to it with appropriate **public URL and anon key** in app-local env files. This clone currently shows hardcoded `DEMO_BILLS`; the research SQLite is not connected to the app. Verify existing production data read-only before any migration/seed. Never use a service-role key in the mobile bundle.
- Approve (or revise) the proposed Supabase migration, ingestion policy and RLS before applying anything. Open decisions: federal `state_scope='US'`, Housing vs Foreign Policy topic chips, unmapped policy areas, status taxonomy, old/new congressional map cutover for rankings, repo visibility, and whether to adopt the PRD's SMS identity flow. Keep government roll calls separate from app-user votes.

### Data-source spike follow-through

- With owner-provided keys only, test LegiScan (`LEGISCAN_API_KEY`) for Utah roll calls/cross-checks and keyed UGRC (`UGRC_API_KEY`) for public-building address matches; log credential-free request URLs, status, latency and observed fields. Follow provider quotas, attribution, licensing and cache guidance; stop on 429/403. Optional `OPENSTATES_API_KEY`/`GEOCODIO_API_KEY` need licensing/usage decisions; no account creation or spending by agents.
- Resolve Senate XML 403 through a permitted source/official access path; do not spoof a human or evade the block. Complete federal/Utah roll-call crosswalks; only import member positions with proven official IDs and vote associations. Reconcile Utah roster 103 vs expected 104 and sample early-stage status mappings.
- Do the runbook's one-hour-apart change-detection dry run only while respecting source frequency limits; compare source update fields and estimate daily call volume. It was **not done** in the initial spike.
- If owner approves a spend cap, perform the AI summary/pros/cons/counter-perspective dry run from official bill text/fiscal notes with disclosure and human review. It was **not done**; do not assume the runbook's old model/pricing estimates remain current.
- Package validated code/small samples and a consolidated `docs/data-sources/FINDINGS.md` plus `CHANGED.md` on the feature branch, using planner → coder → tester → reviewer, secret checks and small commits. The initial work remained in `/Users/wilkergonzalez/Desktop/USAPP/research/` and `/Users/wilkergonzalez/Desktop/USAPP/staging/`; the original runbook's full completion criteria were not met. Do not include the flawed backup bundles or private credentials.

### App and local tooling

- Expo doctor passed 20/21 checks after dependency alignment. The remaining warning is local Xcode **26.2**, below Expo SDK 57's **26.4+** requirement for native iOS builds. Expo Go simulator opened, but owner must update Xcode before claiming native build support. Recheck installed Xcode/version compatibility rather than downgrading Expo just to silence the check.
- `npm audit` flagged dependency advisories, including the admin Next.js version. Review and upgrade safely with tests before any deployment; do **not** run `npm audit fix --force` blindly. No security remediation was claimed.
- Test the app with the owner's intended Supabase project (auth, existing bills/profile/votes, admin review, storage/RLS) in a safe read-only-first workflow. The emulator smoke test only proved demo screens and bundling. Do not run seed.sql or migrations against the owner's live project merely to see whether old data exists.

## Practical verification commands (from repo root unless noted)

```sh
npm run mobile:typecheck
npm run admin:lint
npm run admin:build
npm test
cd apps/mobile && npx expo-doctor
# Run ONE at a time from apps/mobile; Control-C stops the server:
npm run ios
npm run android
# Offline staging tests (outside repo):
cd /Users/wilkergonzalez/Desktop/USAPP/staging && python3 -m unittest -v test_importer
```

This document records the state observed during the conversation, not a guarantee about future credentials, data or dependencies. Check the live tree and ask the owner before performing production-affecting steps.
