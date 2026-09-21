-- ============================================================================
-- Farmer's Choice Market — stockists & live rider tracking
-- Adds:
--   * stockists — fulfilment locations (principal butchery plant + stockists)
--   * orders.stockist_id — the stockist each order is fulfilled from
--   * courier_locations — GPS pings beamed from the rider's phone for the
--     live tracking map
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Stockists (fulfilment locations)
-- ----------------------------------------------------------------------------
create table if not exists public.stockists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null default 'Nairobi',
  phone text,
  lat double precision not null,
  lng double precision not null,
  opening_hours text,
  notes text,
  is_active boolean not null default true,
  is_principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_stockists_active on public.stockists(is_active);

drop trigger if exists trg_stockists_updated on public.stockists;
create trigger trg_stockists_updated before update on public.stockists
  for each row execute function public.set_updated_at();

-- The stockist an order is fulfilled from ------------------------------------
alter table public.orders add column if not exists stockist_id uuid
  references public.stockists(id) on delete set null;
create index if not exists idx_orders_stockist on public.orders(stockist_id);

-- ----------------------------------------------------------------------------
-- Courier GPS pings (rider phone beacon)
--
-- RLS is enabled with NO policies on purpose: direct browser access is denied.
-- The beacon POSTs through /api/courier/location (courier role + assigned trip
-- verified server-side) and customers read the latest ping through
-- /api/orders/[id]/tracking (participation verified via getParticipant), both
-- using the service role.
-- ----------------------------------------------------------------------------
create table if not exists public.courier_locations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  heading_deg double precision,
  speed_mps double precision,
  created_at timestamptz not null default now()
);
create index if not exists idx_courier_locations_order
  on public.courier_locations(order_id, created_at desc);

alter table public.courier_locations enable row level security;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.stockists enable row level security;

-- Stockist locations are public read (customers see "fulfilled from X").
drop policy if exists "stockists_public_read" on public.stockists;
create policy "stockists_public_read" on public.stockists
  for select using (true);

drop policy if exists "stockists_admin_write" on public.stockists;
create policy "stockists_admin_write" on public.stockists
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Seed: the principal Farmer's Choice butchery plant (Ruiru) plus two example
-- stockists so auto-nearest routing is demonstrable out of the box.
-- Coordinates are approximate — correct them via /admin/stockists.
-- Stable UUIDs keep the seed idempotent across re-runs.
-- ----------------------------------------------------------------------------
insert into public.stockists (id, name, address, city, phone, lat, lng, opening_hours, is_active, is_principal)
values
  ('f0000000-0000-4000-8000-000000000001',
   'Farmer''s Choice Butchery Plant — Ruiru (Principal)',
   'Eastern Bypass, Ruiru, Kiambu', 'Nairobi', '+254700000001',
   -1.1872, 36.9538, 'Mon–Sat 07:00–18:00', true, true),
  ('f0000000-0000-4000-8000-000000000002',
   'Farmer''s Choice Stockist — Kasarani Mwiki',
   'Mwiki Road, Kasarani, Nairobi', 'Nairobi', '+254700000002',
   -1.2438, 36.9085, 'Mon–Sat 08:00–19:00', true, false),
  ('f0000000-0000-4000-8000-000000000003',
   'Farmer''s Choice Stockist — Kikuyu',
   'Kidfarmaco Estate, Kikuyu', 'Nairobi', '+254700000003',
   -1.2478, 36.6642, 'Mon–Sat 08:00–19:00', true, false)
on conflict (id) do update
  set name = excluded.name,
      address = excluded.address,
      city = excluded.city,
      phone = excluded.phone,
      lat = excluded.lat,
      lng = excluded.lng,
      opening_hours = excluded.opening_hours,
      is_active = excluded.is_active,
      is_principal = excluded.is_principal;
