-- Verification workflow, admin review, private document storage, and public bill vote counts.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists verification_rejection_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin'));

alter table public.profiles
  drop constraint if exists profiles_verification_status_check;

alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'suspended', 'failed'));

alter table public.profiles
  alter column verification_status set default 'unverified';

update public.profiles
set verification_status = 'rejected'
where verification_status = 'failed';

update public.profiles
set role = 'user'
where role is null;

create table if not exists public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  document_type text not null,
  storage_paths text[] not null default '{}'::text[],
  document_checksum text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  decision_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bills
  add column if not exists approve_count integer not null default 0,
  add column if not exists disapprove_count integer not null default 0,
  add column if not exists total_votes integer not null default 0;

create index if not exists verification_submissions_user_id_idx on public.verification_submissions (user_id);
create index if not exists verification_submissions_status_idx on public.verification_submissions (status);
create index if not exists bills_vote_totals_idx on public.bills (total_votes desc, updated_at desc);

alter table public.verification_submissions enable row level security;

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role = 'admin'
  );
$$;

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

drop trigger if exists verification_submissions_touch_updated_at on public.verification_submissions;
create trigger verification_submissions_touch_updated_at
  before update on public.verification_submissions
  for each row execute function public.touch_updated_at();

create or replace function public.seed_bill_vote_counts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.bills
      set approve_count = approve_count + case when new.stance = 'approve' then 1 else 0 end,
          disapprove_count = disapprove_count + case when new.stance = 'disapprove' then 1 else 0 end,
          total_votes = total_votes + 1
    where id = new.bill_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.bills
      set approve_count = greatest(approve_count - case when old.stance = 'approve' then 1 else 0 end, 0),
          disapprove_count = greatest(disapprove_count - case when old.stance = 'disapprove' then 1 else 0 end, 0),
          total_votes = greatest(total_votes - 1, 0)
    where id = old.bill_id;
    return old;
  else
    if old.bill_id = new.bill_id then
      update public.bills
        set approve_count = greatest(approve_count + case when new.stance = 'approve' then 1 else 0 end - case when old.stance = 'approve' then 1 else 0 end, 0),
            disapprove_count = greatest(disapprove_count + case when new.stance = 'disapprove' then 1 else 0 end - case when old.stance = 'disapprove' then 1 else 0 end, 0)
      where id = new.bill_id;
    else
      update public.bills
        set approve_count = greatest(approve_count - case when old.stance = 'approve' then 1 else 0 end, 0),
            disapprove_count = greatest(disapprove_count - case when old.stance = 'disapprove' then 1 else 0 end, 0),
            total_votes = greatest(total_votes - 1, 0)
      where id = old.bill_id;

      update public.bills
        set approve_count = approve_count + case when new.stance = 'approve' then 1 else 0 end,
            disapprove_count = disapprove_count + case when new.stance = 'disapprove' then 1 else 0 end,
            total_votes = total_votes + 1
      where id = new.bill_id;
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists votes_sync_bill_counts on public.votes;
create trigger votes_sync_bill_counts
  after insert or update or delete on public.votes
  for each row execute function public.seed_bill_vote_counts();

create or replace function public.refresh_bill_vote_counts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bills b
  set approve_count = coalesce(v.approve_count, 0),
      disapprove_count = coalesce(v.disapprove_count, 0),
      total_votes = coalesce(v.approve_count, 0) + coalesce(v.disapprove_count, 0)
  from (
    select bill_id,
      count(*) filter (where stance = 'approve') as approve_count,
      count(*) filter (where stance = 'disapprove') as disapprove_count
    from public.votes
    group by bill_id
  ) v
  where b.id = v.bill_id;

  update public.bills
  set approve_count = 0,
      disapprove_count = 0,
      total_votes = 0
  where id not in (select distinct bill_id from public.votes);
end;
$$;

create or replace function public.save_my_profile(
  p_full_name text,
  p_city text,
  p_zip_code text,
  p_interests text[]
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_email := coalesce(auth.jwt() ->> 'email', '');

  insert into public.profiles (
    id,
    email,
    full_name,
    state,
    city,
    zip_code,
    interests,
    role,
    verification_status
  )
  values (
    auth.uid(),
    v_email,
    nullif(trim(p_full_name), ''),
    'UT',
    nullif(trim(p_city), ''),
    nullif(trim(p_zip_code), ''),
    coalesce(p_interests, '{}'::text[]),
    'user',
    'unverified'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    state = 'UT',
    city = excluded.city,
    zip_code = excluded.zip_code,
    interests = excluded.interests,
    updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.submit_verification_document(
  p_document_type text,
  p_storage_paths text[],
  p_document_checksum text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.verification_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.verification_submissions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set verification_status = 'pending',
      verification_submitted_at = now(),
      verification_rejection_reason = null,
      updated_at = now()
  where id = auth.uid();

  insert into public.verification_submissions (
    user_id,
    status,
    document_type,
    storage_paths,
    document_checksum,
    submitted_at,
    metadata
  )
  values (
    auth.uid(),
    'pending',
    p_document_type,
    coalesce(p_storage_paths, '{}'::text[]),
    nullif(p_document_checksum, ''),
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_submission;

  return v_submission;
end;
$$;

create or replace function public.cast_bill_vote(
  p_bill_id uuid,
  p_stance text
)
returns public.votes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vote public.votes;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select verification_status
    into v_status
  from public.profiles
  where id = auth.uid();

  if v_status is null then
    raise exception 'profile_missing';
  end if;

  if v_status <> 'verified' then
    raise exception 'verification_required';
  end if;

  insert into public.votes (user_id, bill_id, stance)
  values (auth.uid(), p_bill_id, p_stance)
  on conflict (user_id, bill_id) do update set
    stance = excluded.stance,
    cast_at = now()
  returning * into v_vote;

  return v_vote;
end;
$$;

create or replace function public.review_verification_submission(
  p_submission_id uuid,
  p_action text,
  p_reason text default null
)
returns public.verification_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.verification_submissions;
  v_admin_id uuid;
  v_target_user_id uuid;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'admin_required';
  end if;

  v_admin_id := auth.uid();

  select *
    into v_submission
  from public.verification_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'submission_not_found';
  end if;

  v_target_user_id := v_submission.user_id;

  if p_action = 'approve' then
    v_new_status := 'approved';
    update public.profiles
      set verification_status = 'verified',
          verified_at = now(),
          verification_reviewed_at = now(),
          verification_reviewed_by = v_admin_id,
          verification_rejection_reason = null,
          updated_at = now()
    where id = v_target_user_id;
  elsif p_action = 'reject' then
    v_new_status := 'rejected';
    update public.profiles
      set verification_status = 'rejected',
          verification_reviewed_at = now(),
          verification_reviewed_by = v_admin_id,
          verification_rejection_reason = nullif(p_reason, ''),
          updated_at = now()
    where id = v_target_user_id;
  elsif p_action = 'request_resubmission' then
    v_new_status := 'rejected';
    update public.profiles
      set verification_status = 'rejected',
          verification_reviewed_at = now(),
          verification_reviewed_by = v_admin_id,
          verification_rejection_reason = coalesce(nullif(p_reason, ''), 'resubmission_requested'),
          updated_at = now()
    where id = v_target_user_id;
  else
    raise exception 'unsupported_action';
  end if;

  update public.verification_submissions
    set status = v_new_status,
        reviewed_at = now(),
        reviewed_by = v_admin_id,
        decision_reason = nullif(p_reason, ''),
        updated_at = now()
  where id = p_submission_id
  returning * into v_submission;

  insert into public.admin_audit_log (admin_id, action, target_user_id, metadata)
  values (
    v_admin_id,
    p_action,
    v_target_user_id,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'reason', nullif(p_reason, ''),
      'result_status', v_new_status
    )
  );

  return v_submission;
end;
$$;

-- Existing access boundaries.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  with check (auth.uid() = id);

-- Keep direct profile updates restricted; profile changes should go through save_my_profile.
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_admin_read
  on public.profiles for select
  using (public.is_admin());

-- Bills remain public.
drop policy if exists bills_public_read on public.bills;
create policy bills_public_read
  on public.bills for select
  using (true);

-- Votes: users can only read their own and insert when verified.
drop policy if exists votes_select_own on public.votes;
create policy votes_select_own
  on public.votes for select
  using (auth.uid() = user_id);

drop policy if exists votes_insert_own on public.votes;
create policy votes_insert_own
  on public.votes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.verification_status = 'verified'
    )
  );

create policy votes_admin_read
  on public.votes for select
  using (public.is_admin());

-- Verification submissions: users can read their own metadata.
drop policy if exists verification_submissions_select_own on public.verification_submissions;
create policy verification_submissions_select_own
  on public.verification_submissions for select
  using (auth.uid() = user_id);

create policy verification_submissions_admin_read
  on public.verification_submissions for select
  using (public.is_admin());

-- Storage bucket for private verification uploads.
insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do update set public = excluded.public;

revoke all on storage.objects from anon, authenticated;

drop policy if exists verification_documents_insert_own on storage.objects;
create policy verification_documents_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists verification_documents_update_own on storage.objects;
create policy verification_documents_update_own
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- Admins should use service role signed URLs; no public read policy is created for the bucket.

select public.refresh_bill_vote_counts();
