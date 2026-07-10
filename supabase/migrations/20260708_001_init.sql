-- Core tables for the prototype

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  state text not null default 'UT',
  city text,
  zip_code text,
  interests text[] not null default '{}'::text[],
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'failed', 'suspended')),
  verification_provider text,
  verification_session_id text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_bill_id text not null,
  title text not null,
  summary text not null,
  state_scope text not null default 'UT',
  status text not null default 'introduced',
  sponsor text,
  pros text[] not null default '{}'::text[],
  cons text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_bill_id)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  stance text not null check (stance in ('approve', 'disapprove')),
  cast_at timestamptz not null default now(),
  unique (user_id, bill_id)
);

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_event_id text not null unique,
  event_type text not null,
  status text not null,
  reason_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_verification_status_idx on public.profiles (verification_status);
create index if not exists bills_state_scope_idx on public.bills (state_scope);
create index if not exists votes_bill_idx on public.votes (bill_id);

alter table public.profiles enable row level security;
alter table public.bills enable row level security;
alter table public.votes enable row level security;
alter table public.verification_events enable row level security;
alter table public.admin_audit_log enable row level security;

-- Profiles: users can read and update only their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Bills are public for browsing.
drop policy if exists bills_public_read on public.bills;
create policy bills_public_read
  on public.bills for select
  using (true);

-- Votes: only the owning user can read their own votes.
drop policy if exists votes_select_own on public.votes;
create policy votes_select_own
  on public.votes for select
  using (auth.uid() = user_id);

drop policy if exists votes_insert_own on public.votes;
create policy votes_insert_own
  on public.votes for insert
  with check (auth.uid() = user_id);

-- Verification events: internal only (no public select policy).

-- Admin audit log: internal only (no public select policy).

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists bills_touch_updated_at on public.bills;
create trigger bills_touch_updated_at
  before update on public.bills
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
