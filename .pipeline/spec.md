# Utah Civic Prototype Increment Plan

**Goal:** Turn the current in-memory prototype into a realistic Utah-only civic app prototype with email/password auth, mobile-first onboarding, document-based verification, an admin review queue, and Supabase-backed persistence.

**Architecture:** Keep the Expo mobile app and Next.js admin app, but replace demo state with Supabase Auth + Postgres + private storage. Mobile handles registration, profile completion, document upload, bill browsing, and vote casting. Admin handles verification review, status changes, and audit logging. Use low-budget, first-party Supabase services only for this increment; no third-party KYC vendor, no public API, and no raw ID exposure in the UI.

**Tech Stack:** Expo React Native, Next.js App Router, Supabase Auth/Postgres/Storage/RLS, `@supabase/supabase-js`, `expo-document-picker` (or equivalent Expo file picker), existing TypeScript tooling.

---

## Scope for this increment

### In scope
- Email/password sign-up, login, password reset.
- Mobile-first onboarding flow with Utah residency/profile fields and interest selection.
- Document upload for verification with pending/reviewed/approved/rejected states.
- Private backend storage for verification documents.
- Admin review dashboard with approve/reject/request-resubmission actions.
- Audit log for every admin decision.
- Bill feed persisted in Supabase so the app is no longer hardcoded to sample arrays.
- Vote gating: only verified users can cast one vote per bill.
- Clear public vs private data boundaries.

### Out of scope
- Third-party identity vendor integration.
- Raw ID retention in app DB or public storage.
- AI summaries / counter-perspective generation.
- Push notifications.
- Rep response channel.
- Public API or institutional analytics.

---

## Current repo patterns to follow
- Mobile prototype flow and visual style: `apps/mobile/App.tsx`
- Admin dashboard layout/style: `apps/admin/src/app/page.tsx`, `apps/admin/src/app/globals.css`
- Existing schema baseline: `supabase/migrations/20260708_001_init.sql`
- Current repo scripts: root `package.json`, `apps/mobile/package.json`, `apps/admin/package.json`

---

## Files to create or modify

### Backend / schema
- Create: `supabase/migrations/20260708_002_verification_workflow.sql`
- Modify: `supabase/migrations/20260708_001_init.sql` only if the new migration needs to fix a base constraint; prefer a new migration instead
- Optional: `supabase/seed.sql` if demo bills or a starter admin account need seeding

### Shared env/docs
- Create: `.env.example`
- Modify: `README.md` with the new run/setup flow and env names

### Mobile app
- Modify: `apps/mobile/App.tsx` to swap in-memory demo state for auth-backed state and document upload flow
- Create: `apps/mobile/src/lib/supabase.ts`
- Create: `apps/mobile/src/lib/verification.ts`
- Create: `apps/mobile/src/types.ts` if shared row/type definitions are needed
- Modify: `apps/mobile/package.json` to add Supabase + file-picker deps

### Admin app
- Modify: `apps/admin/src/app/page.tsx` to read the live verification queue, not static arrays
- Create: `apps/admin/src/lib/supabase.ts`
- Create: `apps/admin/src/app/api/admin/verifications/[id]/route.ts` or equivalent route handlers for approve/reject/update actions
- Modify: `apps/admin/package.json` to add Supabase deps if needed

---

## Data model and backend wiring

### 1) Auth and profile model
Use Supabase Auth for email/password accounts. Keep `profiles` as the application profile record keyed to `auth.users.id`.

Add or confirm these profile fields:
- `role` (`user` | `admin`) for dashboard access control
- `verification_status` (`unverified` | `pending` | `verified` | `rejected` | `suspended`)
- `verification_submitted_at`
- `verification_reviewed_at`
- `verification_reviewed_by`
- `verification_rejection_reason`

Keep the Utah-only profile fields already implied by the prototype:
- full name
- city
- ZIP code
- interests array
- state fixed to UT for this increment

### 2) Verification submission model
Add a verification submission table that stores only metadata, not raw document content:
- user id
- submitted status
- document type label
- storage path(s)
- file hash or checksum
- submitted timestamp
- reviewed timestamp
- reviewed by admin id
- decision reason / note

### 3) Private document storage
Create a private Supabase Storage bucket for verification uploads.
- Uploads must not be public.
- Admin should access documents through server-generated signed URLs.
- After a final decision, delete the uploaded object or enforce a short retention window; do not keep raw ID files indefinitely in app-visible storage.

### 4) Admin audit log
Every approve/reject/resubmit action must create an immutable audit row with:
- admin id
- target user id
- action
- timestamp
- metadata JSON

### 5) Bills and votes
Keep bills in Supabase instead of hardcoded arrays.
- Public read access for bill browsing.
- One vote per user per bill.
- Vote insert blocked unless the user profile is verified.
- Vote reads limited to the owning user unless the admin role explicitly needs an aggregate view.

### 6) RLS boundaries
Enforce all access in Postgres, not just the UI:
- Users can read and edit only their own profile.
- Users can create and read only their own verification submission metadata.
- Admins can read the verification queue and documents.
- Public users can read bills.
- Only verified users can insert votes.
- No public policy for document tables or admin audit tables.

---

## Mobile flow spec

### 1) Entry and authentication
Replace the current single-screen demo with a mobile-first flow:
1. Splash / welcome
2. Sign up or sign in with email/password
3. Password reset path
4. Profile completion
5. Document upload
6. Pending review state
7. Feed + voting when verified

### 2) Profile completion
Collect:
- full name
- city
- ZIP code
- interests (at least 2 selected for personalization)
- Utah residency confirmation copy

The UI should clearly say:
- browsing is allowed before verification
- voting is locked until approved
- rejected users may resubmit

### 3) Document upload
Use one required upload step for this increment.
- Accept image/PDF upload from device or browser
- Store the file privately in Supabase Storage
- Show upload progress or a simple pending state
- After upload, mark the profile as pending and queue it for admin review

### 4) Bill feed and vote gating
Read bills from Supabase.
- Mobile feed must be scrollable and mobile-first
- Bill cards show title, summary, sponsor, status, and vote counts
- Approve/Disapprove actions call backend write paths
- If not verified, tapping vote shows a clear locked state and does not write a vote

### 5) Status states
Show explicit states in the mobile UI:
- Unverified: can browse only
- Pending: document submitted, waiting on review
- Verified: vote enabled
- Rejected: resubmit available with reason
- Suspended: browsing stays available, voting disabled

---

## Admin flow spec

### 1) Queue view
Replace the static dashboard queue with live Supabase data.
Display per submission:
- name
- email
- city / ZIP
- submission time
- status
- document type
- review note

### 2) Review actions
Admin can:
- approve
- reject with reason
- request resubmission / keep pending

Each action must:
- update the profile verification status
- update the submission row
- write an audit log row
- remove or archive the raw upload according to the retention rule

### 3) Admin access control
The admin UI must only render the queue if the current user has the admin role.
If not admin, show a blocked/unauthorized state.
Do not rely on client-side hiding alone; enforce on the server and in RLS.

---

## Low-budget implementation choices
- Use Supabase Auth instead of a custom auth service.
- Use manual document review instead of paid identity verification.
- Use Supabase Storage private buckets instead of a separate file service.
- Avoid OCR or automated document classification for this increment.
- Keep the mobile UI in the existing single-app Expo structure unless splitting files is necessary for readability.

---

## Required secrets / API auth

### Must-have
- `SUPABASE_URL` or platform-specific public URL envs
- `SUPABASE_ANON_KEY` for the mobile app and any client-side admin reads
- `SUPABASE_SERVICE_ROLE_KEY` for server-only admin actions and secure review endpoints
- Supabase project/database access needed to run the migration
- Supabase Auth email configuration sufficient to send login / reset emails

### Optional
- Custom SMTP credentials for branded auth emails
- Custom app domain / redirect URLs for auth emails
- Supabase Storage custom bucket CORS settings if web uploads need tightening
- Sentry / analytics keys if observability is added later
- Any future KYC vendor keys, but not needed for this increment

---

## Verification boundaries

### Must verify
- A new user can sign up with email/password.
- A profile can be completed for a Utah user.
- A document can be uploaded and the profile becomes pending.
- Admin can see the pending submission in the review queue.
- Admin can approve or reject and the audit log records the decision.
- Verified users can cast exactly one vote per bill.
- Unverified or pending users cannot vote.
- Bills remain browsable before verification.
- Raw document files are not exposed publicly.

### Not required for this increment
- Real identity provider / government ID checks
- Automated fraud scoring
- Production mobile store publishing
- AI-generated bill content
- Public analytics dashboards
- Multi-state support beyond Utah

---

## Implementation order
1. Add/extend Supabase schema and RLS for profiles, verification submissions, storage access, votes, and audit logs.
2. Add Supabase client helpers and env examples.
3. Wire the Expo app to auth, profile completion, document upload, and live bill data.
4. Wire the Next.js admin dashboard to live queue data and secure decision endpoints.
5. Update README and smoke-test both apps with the new env vars.

---

## Acceptance criteria
- The prototype no longer depends on in-memory verification state.
- The mobile app feels like a real Utah civic flow, optimized for phones first.
- Admin review is backed by the database and protected by role checks.
- Document storage stays private and is not surfaced as raw ID content.
- The implementation is easy for the next agent to verify without guessing.
