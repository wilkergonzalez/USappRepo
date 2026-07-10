# US: The People — Utah Civic Prototype

This repo contains:
- `apps/mobile`: Expo React Native prototype for citizens
- `apps/admin`: Next.js admin dashboard prototype
- `supabase/migrations`: starter schema for auth, profiles, bills, votes, verification submissions, storage, and audit logs
- `supabase/seed.sql`: optional demo bills seed

## What the prototype does
- Email/password sign-up, sign-in, and password reset
- Utah-scoped profile capture and interest selection
- Private verification document upload with pending/reviewed states
- Browse bills before verification
- Vote gating until verified
- Admin review dashboard with approve / reject / resubmit actions
- Demo/offline fallback when Supabase env vars are missing

## Environment
Copy `.env.example` to your local env file and fill in the Supabase values.

### Mobile Expo app
Use Expo public env vars:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Admin app
Use these for server-side access and browser auth:
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for secure review actions

If the Supabase env vars are absent, both apps fall back to demo data so the prototype still runs locally.

## Run it
Mobile (Expo web preview):
```bash
npm run mobile:web
```

Admin dashboard:
```bash
npm run admin
```

If you have Expo Go or a simulator available, you can also run the native mobile shell from `apps/mobile` with `npm run ios` or `npm run android`.

## Supabase setup
1. Apply the SQL migrations in `supabase/migrations`.
2. Seed demo bills with `supabase/seed.sql` if you want a starter feed.
3. Create a private Storage bucket named `verification-documents` if it does not already exist; the migration also attempts to create it.
4. Add an admin profile row for the account you want to use in the dashboard and set `role = 'admin'`.

## Notes
- Verification uploads store metadata and storage paths, not raw ID content.
- Admin review uses signed URLs and deletes raw uploads after the final decision.
- The current demo path is intentionally simple so the prototype remains usable even before Supabase credentials are configured.
