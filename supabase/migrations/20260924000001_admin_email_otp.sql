-- ============================================================================
-- Farmer's Choice Market — emailed one-time codes for sensitive admin actions
-- (M-Pesa paybill amendments). Replaces the previous TOTP second factor.
--
-- Design:
--   * One row per admin (user_id PK): at most one live code at a time. Issuing
--     a new code overwrites the row, invalidating the previous one.
--   * Only the SHA-256 hash of the 5-digit code is stored — never the code
--     itself — so a database leak does not reveal live codes.
--   * `expires_at` enforces the 10-minute validity window; `consumed_at`
--     makes a verified code single-use.
--
-- Security:
--   * RLS enabled with NO policies — the anon/authenticated roles can neither
--     read nor write. The table is reachable only via the service role (or the
--     SQL editor), which is exactly how the API routes use it: they always
--     verify the caller is an admin first, then use the admin client.
--   * Row is keyed by profiles.id (FK, on delete cascade) so rows die with
--     the account.
-- Idempotent: safe to run more than once. Also drops the retired
-- `admin_totp_secrets` table if it exists.
-- ============================================================================

-- The TOTP authenticator flow was replaced by emailed codes — remove its table.
drop table if exists public.admin_totp_secrets;

create table if not exists public.admin_email_otp_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  /** sha256(code) hex digest. The plain code is never persisted. */
  code_hash text not null check (char_length(code_hash) = 64),
  expires_at timestamptz not null,
  /** Set on successful verification — makes the code single-use. */
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_email_otp_codes enable row level security;

-- No policies: RLS with zero policies denies every role except the service
-- role (which bypasses RLS by definition). Assert that it stays that way.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_email_otp_codes'
  ) then
    raise exception 'admin_email_otp_codes must have NO row level security policies';
  end if;
end $$;

-- Revoke any default grants so the Data API roles have no path in.
revoke all on public.admin_email_otp_codes from anon, authenticated;
