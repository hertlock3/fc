-- ============================================================================
-- Farmer's Choice Market — initial schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('customer', 'admin', 'vendor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'pending_payment', 'paid', 'awaiting_vendor_approval', 'vendor_approved',
    'dispatching', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum
    ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_status as enum (
    'pending', 'requested', 'assigned', 'picked_up', 'delivering',
    'delivered', 'cancelled', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_provider as enum ('sim', 'uber_direct', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_kind as enum ('customer', 'vendor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('issued', 'paid', 'settled', 'void');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Shared updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent privilege escalation: RLS cannot restrict which columns a user may
-- change, so without this trigger a customer could set their own role to
-- 'admin' via `update profiles set role='admin'`. Only admins may change roles.
-- The `auth.uid() is not null` guard lets trusted server-side contexts (the
-- SQL Editor / service role, where there is no JWT) run the initial promotion
-- documented in the README, while still blocking authenticated customers.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators can change a profile role';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_protect_role on public.profiles;
create trigger trg_profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Helper: is the current user an admin/vendor?
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'vendor')
  );
$$;

-- ----------------------------------------------------------------------------
-- Addresses (delivery locations)
-- ----------------------------------------------------------------------------
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  line1 text not null,
  area text,
  city text not null default 'Nairobi',
  lat double precision not null,
  lng double precision not null,
  delivery_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_addresses_user on public.addresses(user_id);

drop trigger if exists trg_addresses_updated on public.addresses;
create trigger trg_addresses_updated before update on public.addresses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Catalog
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price_cents integer not null check (price_cents >= 0),
  unit text not null default 'each',
  image_url text,
  sku text unique,
  in_stock boolean not null default true,
  stock_qty integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_active on public.products(is_active);

-- ----------------------------------------------------------------------------
-- Cart
-- ----------------------------------------------------------------------------
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists idx_cart_items_user on public.cart_items(user_id);

drop trigger if exists trg_cart_items_updated on public.cart_items;
create trigger trg_cart_items_updated before update on public.cart_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status order_status not null default 'pending_payment',
  payment_status payment_status not null default 'pending',

  subtotal_cents integer not null default 0,
  delivery_fee_cents integer not null default 0,
  service_fee_cents integer not null default 0,
  total_cents integer not null default 0,
  vendor_payout_cents integer not null default 0,
  platform_fee_cents integer not null default 0,

  delivery_address jsonb,
  delivery_lat double precision,
  delivery_lng double precision,
  distance_km double precision,

  mpesa_receipt text,
  payment_ref text,

  delivery_provider delivery_provider,
  delivery_external_id text,
  delivery_status delivery_status,

  customer_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  approved_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz
);
create index if not exists idx_orders_user on public.orders(user_id);
create index if not exists idx_orders_status on public.orders(status);

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  unit text not null default 'each',
  unit_price_cents integer not null,
  quantity integer not null check (quantity > 0),
  line_total_cents integer not null
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- ----------------------------------------------------------------------------
-- Invoices (customer receipt + Farmer's Choice payout invoice)
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind invoice_kind not null,
  invoice_number text not null unique,
  subtotal_cents integer not null default 0,
  delivery_fee_cents integer not null default 0,
  service_fee_cents integer not null default 0,
  total_cents integer not null default 0,
  status invoice_status not null default 'issued',
  issued_at timestamptz not null default now(),
  meta jsonb
);
create index if not exists idx_invoices_order on public.invoices(order_id);

-- ----------------------------------------------------------------------------
-- Payments
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'sim',
  amount_cents integer not null,
  phone text not null,
  status payment_status not null default 'pending',
  merchant_request_id text,
  checkout_request_id text,
  result_code integer,
  result_desc text,
  receipt text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payments_order on public.payments(order_id);
create index if not exists idx_payments_checkout on public.payments(checkout_request_id);

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Deliveries
-- ----------------------------------------------------------------------------
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider delivery_provider not null default 'sim',
  external_id text,
  status delivery_status not null default 'pending',
  courier_name text,
  courier_phone text,
  tracking_url text,
  fee_cents integer not null default 0,
  pickup jsonb,
  dropoff jsonb,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_deliveries_order on public.deliveries(order_id);

drop trigger if exists trg_deliveries_updated on public.deliveries;
create trigger trg_deliveries_updated before update on public.deliveries
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Order timeline
-- ----------------------------------------------------------------------------
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  message text not null,
  actor text not null default 'system',
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_events_order on public.order_events(order_id);

-- ----------------------------------------------------------------------------
-- Settings (key/value config, e.g. pricing overrides)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.addresses    enable row level security;
alter table public.categories   enable row level security;
alter table public.products     enable row level security;
alter table public.cart_items   enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.invoices     enable row level security;
alter table public.payments     enable row level security;
alter table public.deliveries   enable row level security;
alter table public.order_events enable row level security;
alter table public.settings     enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Admins may update any profile (e.g. to grant the vendor role).
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- addresses -----------------------------------------------------------------
drop policy if exists "addresses_owner_all" on public.addresses;
create policy "addresses_owner_all" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "addresses_admin_select" on public.addresses;
create policy "addresses_admin_select" on public.addresses
  for select using (public.is_admin());

-- catalog (public read of active items) -------------------------------------
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select using (true);

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select using (is_active or public.is_admin());

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- cart ----------------------------------------------------------------------
drop policy if exists "cart_owner_all" on public.cart_items;
create policy "cart_owner_all" on public.cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- orders (owner read; privileged writes happen via the service role) --------
drop policy if exists "orders_owner_select" on public.orders;
create policy "orders_owner_select" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "order_items_owner_select" on public.order_items;
create policy "order_items_owner_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "invoices_owner_select" on public.invoices;
create policy "invoices_owner_select" on public.invoices
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = invoices.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "payments_owner_select" on public.payments;
create policy "payments_owner_select" on public.payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "deliveries_owner_select" on public.deliveries;
create policy "deliveries_owner_select" on public.deliveries
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = deliveries.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "order_events_owner_select" on public.order_events;
create policy "order_events_owner_select" on public.order_events
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- settings ------------------------------------------------------------------
drop policy if exists "settings_public_read" on public.settings;
create policy "settings_public_read" on public.settings
  for select using (true);

drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings
  for all using (public.is_admin()) with check (public.is_admin());
