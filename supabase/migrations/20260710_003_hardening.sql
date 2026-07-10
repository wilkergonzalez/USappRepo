-- Security hardening for the Supabase-backed prototype.
-- This migration is intentionally additive and does not enable government-data
-- integrations or third-party identity verification.

-- Profiles are created by the auth.users trigger. Do not allow a normal user
-- to insert a row that claims admin or verified privileges.
drop policy if exists profiles_insert_own on public.profiles;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       and not public.is_admin(auth.uid()) then
      raise exception 'role_change_forbidden';
    end if;

    if new.verification_status is distinct from old.verification_status
       and not public.is_admin(auth.uid()) then
      raise exception 'verification_status_change_forbidden';
    end if;

    if new.verification_reviewed_by is distinct from old.verification_reviewed_by
       or new.verification_reviewed_at is distinct from old.verification_reviewed_at
       or new.verified_at is distinct from old.verified_at
       or new.verification_rejection_reason is distinct from old.verification_rejection_reason
       then
      if not public.is_admin(auth.uid()) then
        raise exception 'review_fields_change_forbidden';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
before update on public.profiles
for each row execute function public.protect_profile_security_fields();

-- A user may create at most one active pending submission. Reviewed rows remain
-- available for audit, while a rejected user may submit a replacement.
create unique index if not exists verification_one_pending_per_user_idx
  on public.verification_submissions (user_id)
  where status = 'pending';

create or replace function public.validate_verification_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  path text;
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid()
       and not public.is_admin(auth.uid()) then
      raise exception 'submission_owner_mismatch';
    end if;

    if array_length(new.storage_paths, 1) is null
       or array_length(new.storage_paths, 1) < 1
       or array_length(new.storage_paths, 1) > 3 then
      raise exception 'invalid_storage_path_count';
    end if;

    foreach path in array new.storage_paths loop
      if path !~ ('^' || new.user_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
         or path like '%..%' then
        raise exception 'invalid_storage_path';
      end if;
    end loop;

    if new.document_type not in ('Driver license', 'State ID', 'Utility bill', 'Lease agreement') then
      raise exception 'unsupported_document_type';
    end if;

    if new.document_checksum is not null
       and new.document_checksum !~ '^[0-9a-fA-F]{64}$' then
      raise exception 'invalid_document_checksum';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.document_type is distinct from old.document_type
       or new.storage_paths is distinct from old.storage_paths
       or new.document_checksum is distinct from old.document_checksum
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'submission_fields_immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists verification_submissions_validate on public.verification_submissions;
create trigger verification_submissions_validate
before insert or update on public.verification_submissions
for each row execute function public.validate_verification_submission();

-- Submission metadata is written through the security-definer RPC only.
drop policy if exists verification_submissions_insert_own on public.verification_submissions;
drop policy if exists verification_submissions_update_own on public.verification_submissions;
drop policy if exists verification_submissions_delete_own on public.verification_submissions;

-- Verification objects are immutable after upload. A replacement requires a
-- new submission and therefore a new object path.
drop policy if exists verification_documents_update_own on storage.objects;

drop policy if exists verification_documents_insert_own on storage.objects;
create policy verification_documents_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
  and name not like '%..%'
);

-- The client may clean up an upload only if submission creation failed before
-- the object was recorded. Once recorded, users cannot delete the document.
drop policy if exists verification_documents_delete_unsubmitted on storage.objects;
create policy verification_documents_delete_unsubmitted
on storage.objects for delete to authenticated
using (
  bucket_id = 'verification-documents'
  and split_part(name, '/', 1) = auth.uid()::text
  and not exists (
    select 1
    from public.verification_submissions submission
    where submission.user_id = auth.uid()
      and name = any(submission.storage_paths)
  )
);

-- The bucket remains private. Admins use server-generated signed URLs.

-- Security-definer functions must not be callable by anonymous clients or the
-- default PUBLIC role. The authenticated role is the only client-facing role.
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

revoke execute on function public.save_my_profile(text, text, text, text[]) from public, anon;
grant execute on function public.save_my_profile(text, text, text, text[]) to authenticated;

revoke execute on function public.submit_verification_document(text, text[], text, jsonb) from public, anon;
grant execute on function public.submit_verification_document(text, text[], text, jsonb) to authenticated;

revoke execute on function public.cast_bill_vote(uuid, text) from public, anon;
grant execute on function public.cast_bill_vote(uuid, text) to authenticated;

revoke execute on function public.review_verification_submission(uuid, text, text) from public, anon;
grant execute on function public.review_verification_submission(uuid, text, text) to authenticated;

revoke execute on function public.refresh_bill_vote_counts() from public, anon, authenticated;

-- Keep all hardening helpers private to the database.
revoke execute on function public.protect_profile_security_fields() from public, anon, authenticated;
grant execute on function public.protect_profile_security_fields() to postgres, service_role;

revoke execute on function public.validate_verification_submission() from public, anon, authenticated;
grant execute on function public.validate_verification_submission() to postgres, service_role;
