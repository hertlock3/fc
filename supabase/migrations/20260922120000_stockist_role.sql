-- ============================================================================
-- Farmer's Choice Market — stockist partner accounts
-- Adds:
--   * 'stockist' user role (partner accounts that fulfil orders)
--   * stockists.profile_id — the partner login linked to a stockist location
--   * RLS so a stockist account can read the orders assigned to them
-- Idempotent: safe to run more than once.
-- ============================================================================

-- New user role ---------------------------------------------------------------
-- (The new value is used by app code, never within this same transaction.)
do $$ begin
  alter type user_role add value 'stockist';
exception when duplicate_object then null; end $$;

-- Link a stockist location to its partner login -------------------------------
alter table public.stockists add column if not exists profile_id uuid
  references public.profiles(id) on delete set null;
create index if not exists idx_stockists_profile on public.stockists(profile_id);

-- One login can manage at most one stockist location --------------------------
create unique index if not exists uq_stockists_profile
  on public.stockists(profile_id) where profile_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: stockist accounts can read the orders fulfilled from their location.
-- (Writes still happen exclusively through the service role after explicit
-- authorisation checks in route handlers.)
-- ---------------------------------------------------------------------------
drop policy if exists "orders_stockist_select" on public.orders;
create policy "orders_stockist_select" on public.orders
  for select using (
    exists (
      select 1 from public.stockists s
      where s.profile_id = auth.uid()
        and orders.stockist_id = s.id
    )
  );

drop policy if exists "order_items_stockist_select" on public.order_items;
create policy "order_items_stockist_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      join public.stockists s on s.id = o.stockist_id
      where o.id = order_items.order_id
        and s.profile_id = auth.uid()
    )
  );

-- A stockist reads their own location row (needed by the dashboard).
drop policy if exists "stockists_partner_read" on public.stockists;
create policy "stockists_partner_read" on public.stockists
  for select using (profile_id = auth.uid() or public.is_admin());
