-- ============================================================================
-- Farmer's Choice Market — partner approval gate
-- Adds:
--   * profiles.approval_status ('pending' | 'approved' | 'rejected')
--   * approved_partners() RLS helper used by policies and route handlers
--   * Backfill: everyone who existed before this migration is approved
-- Idempotent: safe to run more than once.
--
-- Design: the column defaults to 'approved' so every pre-existing role
-- (customer, admin, vendor) keeps working unchanged. Partner registration
-- (POST /api/auth/register) inserts 'pending' server-side — never client
-- metadata — and admins flip it to 'approved' from /admin/team.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- approval_status column
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists approval_status text
  not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));

-- Backfill safety: anyone who existed before this migration is approved.
update public.profiles set approval_status = 'approved'
where approval_status is distinct from 'approved';

-- Cheap lookup for the admin "pending partners" list and the middleware gate.
create index if not exists idx_profiles_pending
  on public.profiles(approval_status) where approval_status = 'pending';

-- ----------------------------------------------------------------------------
-- Helper: is the signed-in user fully approved? SECURITY DEFINER so RLS on
-- profiles cannot be used to spoof it. Returns false for anonymous callers.
-- ----------------------------------------------------------------------------
create or replace function public.approved_partners()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS: every account may read its OWN profile row regardless of approval
-- status — the middleware and the /pending-approval page need it to render
-- the gate. (The existing "profiles_select_own" policy already grants
-- auth.uid() = id, so no policy change is required.)
--
-- There is deliberately NO policy letting users change their own
-- approval_status: writes go through the service role after the admin check
-- in the route handler, and protect_profile_role() already blocks role
-- self-promotion. approval_status is additionally guarded below.
-- ----------------------------------------------------------------------------

-- Prevent privilege escalation: a user can edit their own profile (name,
-- phone) but must never be able to approve themselves.
create or replace function public.protect_profile_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status is distinct from old.approval_status
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators can change approval status';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_protect_approval on public.profiles;
create trigger trg_profiles_protect_approval before update on public.profiles
  for each row execute function public.protect_profile_approval();
