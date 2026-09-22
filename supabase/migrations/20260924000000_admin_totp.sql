-- ============================================================================
-- Farmer's Choice Market — TOTP second factor for sensitive admin actions
-- (M-Pesa paybill amendments).
--
-- Design:
--   * `admin_totp_secrets` holds one RFC 6238 secret per user, plus the last
--     time step consumed, so a code cannot be replayed within its window.
--   * `enrollment` tracks setup state: 'pending' (secret generated, awaiting
--     first valid code) → 'confirmed'. A secret that never confirms is stale
--     and can simply be replaced by starting enrollment again.
--   * The secret is the *encoding* of the key, never the raw key bytes: it is
--     20 random bytes base32-encoded, exactly what authenticator apps import
--     from an otpauth:// URI.
--
-- Security:
--   * RLS enabled with NO policies — the anon/authenticated roles can neither
--     read nor write. The table is reachable only via the service role (or the
--     SQL editor), which is exactly how the API routes use it: they always
--     verify the caller is an admin first, then use the admin client.
--   * Row is keyed by profiles.id (FK, on delete cascade) so secrets die with
--     the account.
-- Idempotent: safe to run more than once.
-- ============================================================================

create table if not exists public.admin_totp_secrets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  secret text not null check (char_length(secret) between 32 and 64),
  enrollment text not null default 'pending'
    check (enrollment in ('pending', 'confirmed')),
  /** Last accepted time-step (unix / 30 s). Prevents code reuse. */
  last_used_step bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_totp_secrets enable row level security;

-- No policies: RLS with zero policies denies every role except the service
-- role (which bypasses RLS by definition). Assert that it stays that way.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_totp_secrets'
  ) then
    raise exception 'admin_totp_secrets must have NO row level security policies';
  end if;
end $$;

-- Revoke any default grants so the Data API roles have no path in.
revoke all on public.admin_totp_secrets from anon, authenticated;
