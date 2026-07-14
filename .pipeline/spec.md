# Local Demo Runnable Increment — Implementation Spec

> **Scope:** Make the documented root commands reliably start the existing Expo web and Next.js admin surfaces, add one clear command for starting both, and add focused command/browser verification. Do not change product behavior, add integrations, or add secrets.

## Goal

From the repository root, a contributor with dependencies installed and no Supabase credentials can run either surface independently or both together, open the expected local URLs, and see the existing usable demo UI with local fallback data. Configured Supabase behavior must remain selected exactly as it is today when the relevant environment variables are present.

## Current findings / constraints

- Root `package.json` currently wraps commands through nested `npm --prefix ... run ...` scripts.
- Extra arguments are mis-forwarded through those wrappers:
  - `npm run admin -- --hostname 127.0.0.1 --port 3000` causes Next to interpret `127.0.0.1` as a project directory.
  - `npm run mobile:web -- --port 8081` causes Expo to interpret `8081` as a project root.
- The known-good package-local commands are:
  - `npm --prefix apps/admin run dev -- --hostname 127.0.0.1 --port 3000`
  - `npm --prefix apps/mobile run web -- --port 8083`
- `apps/mobile/App.tsx` already presents a usable demo flow: auth, profile, document selection/upload state, demo approve/reject controls, bill feed/detail, and vote gating.
- `apps/admin/src/app/page.tsx` already presents a usable read-only demo queue, stats, bills, audit log, and a clear Supabase-vs-demo state.
- `apps/mobile/src/lib/verification.ts` and `apps/admin/src/lib/verifications.ts` already branch to demo data when Supabase configuration is absent. Preserve that branch; do not replace it with fixtures, mock servers, or API calls.
- Branch is `feat/local-demo-runnable`, at clean commit `3aff3e1`. Keep this increment limited to command wiring, docs, and verification.

## Proposed root interface

Keep existing script names for compatibility, but route them through dedicated launchers that explicitly set the child working directory and append arguments after the package script separator.

```text
npm run admin -- [Next dev args]
npm run mobile:web -- [Expo web args]
npm run demo [demo options]
```

Recommended defaults:

| Surface | URL | Child command semantics |
|---|---|---|
| Admin | `http://127.0.0.1:3000` | `npm run dev -- --hostname 127.0.0.1 --port 3000` with cwd `apps/admin` |
| Mobile web | `http://localhost:8081` (or the URL Expo prints) | `npm run web -- --port 8081` with cwd `apps/mobile` |

The launcher must not depend on Supabase, government services, public APIs, live keys, or `.env.local` files.

## Exact files to modify/create

### 1. Root scripts

**Modify:** `/Users/wilkermini/Documents/GitHub/USappRepo/package.json`

- Change `admin` from the nested `npm --prefix ... run dev` form to `node scripts/start-admin.mjs`.
- Change `mobile:web` to `node scripts/start-mobile-web.mjs`.
- Add `demo`: `node scripts/local-demo.mjs`.
- Preserve all existing verification/build/start scripts and the existing `test` entrypoint unless the implementer intentionally extends it to include the new focused test.
- Do not add packages solely for process management.

### 2. Surface launchers

**Create:** `scripts/start-admin.mjs`

Behavior:
- Resolve the repository root and spawn the platform npm executable from `cwd: apps/admin`.
- Invoke `npm run dev -- ...forwardedArgs`.
- If no args are supplied, pass `--hostname 127.0.0.1 --port 3000` so the documented command is deterministic.
- If args are supplied, pass them verbatim after `--`; this must support at least `--hostname`, `--port`, and other Next dev flags.
- Use `stdio: 'inherit'`, preserve the parent environment, and exit with the child status/signal.
- Handle `SIGINT`/`SIGTERM` by terminating the child; do not leave an orphaned Next process.
- Do not shell-concatenate arguments; use `spawn`/`spawnSync` argument arrays to preserve spaces and prevent injection.

**Create:** `scripts/start-mobile-web.mjs`

Behavior:
- Resolve the repository root and spawn npm with `cwd: apps/mobile`.
- Invoke `npm run web -- ...forwardedArgs`.
- If no args are supplied, pass `--port 8081` (and only add a supported local-host option if verified against the installed Expo CLI; do not invent an Expo flag).
- If args are supplied, pass them verbatim after `--`; at minimum `--port` must work.
- Use inherited stdio/environment, propagate exit status, and forward termination signals.
- Do not pass root-level arguments before the nested package script separator.

### 3. Combined local demo launcher

**Create:** `scripts/local-demo.mjs`

Behavior:
- Spawn both launchers (or spawn the package-local commands directly using the same safe argument-array approach) concurrently.
- Defaults: admin port `3000`; mobile web port `8081`; admin hostname `127.0.0.1`.
- Print clear startup lines containing both URLs and explicitly state that demo fallback is active when Supabase variables are absent.
- Support a small, documented option set only:
  - `--admin-port <port>`
  - `--mobile-port <port>`
  - optional `--admin-hostname <host>` if useful; otherwise keep the default fixed.
- Reject unknown options, non-numeric/out-of-range ports, and identical admin/mobile ports with a concise error before spawning children.
- Do not forward `demo` options to Next or Expo. Surface-specific options must be translated into the correct child flags.
- On either child’s unexpected exit, terminate the sibling and exit non-zero. On Ctrl-C/termination, terminate both children and wait for cleanup.
- Avoid a third-party concurrency dependency; Node’s `child_process` is sufficient.
- Keep the launcher local-only; no network/API health checks are required in the launcher itself.

### 4. Focused command-wiring verification

**Create:** `tests/local-demo.test.mjs`

Use Node’s built-in `node:test` and `node:assert/strict`; do not add a new test framework. Cover:

1. Root scripts point to the intended launchers and expose `demo`.
2. Admin launcher builds a child invocation equivalent to `npm run dev -- --hostname ... --port ...` in `apps/admin`, with no argument placed before the nested `--`.
3. Mobile launcher builds `npm run web -- --port ...` in `apps/mobile`.
4. Combined launcher maps `--admin-port` only to Next and `--mobile-port` only to Expo, rejects malformed/duplicate ports, and does not include Supabase/API credentials.
5. Existing fallback-related source remains referenced: test that the existing demo-mode branch markers/messages remain in `apps/mobile/src/lib/verification.ts` and `apps/admin/src/lib/verifications.ts` rather than asserting implementation internals beyond the contract.

To make command construction testable without starting servers, have launchers export pure argument/parser helpers or place shared pure parsing/command construction in `scripts/local-demo-utils.mjs`. Do not make tests depend on an available port, a browser, or external services.

**Modify:** `package.json` test script only if needed to run both suites, preferably:

```json
"test": "node --test tests/hardening.test.mjs tests/local-demo.test.mjs"
```

The existing hardening tests must continue to run.

### 5. Root README / local demo instructions

**Modify:** `README.md`

Replace the current ambiguous run section with a copy/pasteable local-demo section:

1. Install dependencies from the root (`npm install`, or the repository’s already-established install procedure).
2. State explicitly that Supabase env vars are optional for this demo; with none present, both surfaces use existing local demo data.
3. Start both:

   ```bash
   npm run demo
   ```

   Then open `http://127.0.0.1:3000` for Admin and the Expo URL printed for Mobile web (normally `http://localhost:8081`).

4. Start individually:

   ```bash
   npm run admin
   npm run mobile:web
   ```

5. Override ports without breaking argument forwarding:

   ```bash
   npm run admin -- --port 3001 --hostname 127.0.0.1
   npm run mobile:web -- --port 8083
   npm run demo -- --admin-port 3001 --mobile-port 8083
   ```

6. Explain that Ctrl-C stops the combined demo and that an occupied port should be changed using the commands above.
7. Add a short browser smoke checklist (below), not a claim that automated browser tests exist.
8. Keep the existing Supabase setup/env variable documentation and explicitly state that this increment adds no API integrations or credentials.

**Optional modify:** `apps/admin/README.md` only if its generated Next instructions conflict with root documentation; prefer leaving it untouched to minimize scope.

## Browser smoke expectations

Use the actual launchers, not package-local commands, for the smoke check. With no Supabase env vars configured:

### Admin
- `npm run admin -- --hostname 127.0.0.1 --port 3000` starts without treating `127.0.0.1` as a project directory.
- Browser loads `http://127.0.0.1:3000` with HTTP 200.
- Snapshot visibly contains `Verification review and civic ops dashboard`, `Demo preview`, `Verification queue`, and at least one demo submission such as `Ada Citizen`.
- The page identifies demo/read-only behavior and does not require sign-in or a secret.

### Mobile web
- `npm run mobile:web -- --port 8081` starts without treating `8081` as a project root.
- Browser loads the Expo web URL printed by the CLI (normally `http://localhost:8081`) with HTTP 200.
- Snapshot visibly contains `US: The People`, `Demo fallback active`, `Utah profile completion`, `Verification document upload`, and `Bill feed and vote gating`.
- Demo bill cards are visible; vote controls remain locked before verification.
- The existing demo controls remain usable enough to demonstrate pending → demo approve/reject and vote-gating states. Do not add UI solely for this increment unless the smoke check proves a currently existing flow is inaccessible.

### Combined command
- `npm run demo` starts both surfaces concurrently and prints both addresses.
- Ctrl-C terminates both children; no launcher process remains.
- A collision is reported clearly and does not silently bind one surface to an unintended port.

These are browser smoke expectations, not a replacement for Supabase integration testing. Do not claim live auth, storage, RLS, government verification, or API behavior is proven by this increment.

## UI decision

**No additional UI work is necessary for the requested local-demo increment.** The existing mobile and admin surfaces already expose a coherent, inspectable prototype in demo mode. Keep UI changes out of scope unless browser smoke reveals a blocking render/runtime issue caused by command startup. If such a blocker appears, stop and report it rather than expanding the feature; any UI fix should be a separately scoped follow-up.

## Edge cases and non-goals

- Do not modify `apps/mobile/App.tsx`, `apps/mobile/src/lib/verification.ts`, `apps/admin/src/app/page.tsx`, or Supabase migrations for this increment.
- Do not create `.env.local`, commit keys, seed a live project, call a government endpoint, or add a KYC/API integration.
- Preserve configured Supabase behavior; launchers must inherit env vars unchanged rather than forcing demo mode.
- Preserve direct package-local commands as a fallback for debugging.
- Port values must be validated before process startup; ports below 1 or above 65535 are invalid.
- Do not assume that a free port remains free after validation; still surface child bind failures and clean up the sibling.
- Avoid shell-specific syntax so the root scripts work on macOS/Linux and do not rely on Bash-only process management.
- Keep generated `.next`, `.expo`, `node_modules`, and env files ignored.

## Acceptance criteria

- [ ] `npm run admin` starts Next on `127.0.0.1:3000` by default; `npm run admin -- --hostname 127.0.0.1 --port 3001` starts on the requested port.
- [ ] `npm run mobile:web` starts Expo web on `8081` by default; `npm run mobile:web -- --port 8083` starts on the requested port.
- [ ] `npm run demo` starts both surfaces with defaults and prints their URLs.
- [ ] `npm run demo -- --admin-port 3001 --mobile-port 8083` maps each port to the correct surface.
- [ ] Invalid/unknown/duplicate demo options fail before children start; child failure cleans up the sibling.
- [ ] `npm test` passes the existing hardening suite plus command-wiring tests.
- [ ] With Supabase variables absent, both browser surfaces render existing demo data and no secret is required.
- [ ] With Supabase variables present, launchers merely inherit the environment and the existing Supabase branches remain intact.
- [ ] README documents install, individual commands, combined command, port overrides, URLs, fallback semantics, and browser smoke checks.
- [ ] No application code, migrations, credentials, or API integrations are added in this increment.
- [ ] `git diff` shows only the planned script/test/docs files (plus this pipeline handoff file if it is untracked/changed).

## Verification commands for the implementer

Run from repository root:

```bash
npm test
npm run admin -- --hostname 127.0.0.1 --port 3000
npm run mobile:web -- --port 8081
npm run demo
```

For the two individual servers, verify HTTP 200 and perform the browser checklist above. Use alternate ports if occupied, and record the exact ports/URLs in the change summary. Stop all dev servers before final `git status --short` and `git diff --check`.
