-- ============================================================================
-- Farmer's Choice Market — couriers & order messaging
-- Adds:
--   * 'courier' user role
--   * deliveries.courier_id (the assigned rider profile)
--   * order_messages — in-app chat between customer, rider and FC staff
--   * private 'chat-photos' storage bucket for dispute/produce photos
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Courier role ---------------------------------------------------------------
-- (The new value is used by app code, never within this same transaction.)
do $$ begin
  alter type user_role add value 'courier';
exception when duplicate_object then null; end $$;

-- Assigned rider on a delivery ------------------------------------------------
alter table public.deliveries add column if not exists courier_id uuid
  references public.profiles(id) on delete set null;
create index if not exists idx_deliveries_courier on public.deliveries(courier_id);

-- Order messages ---------------------------------------------------------------
-- One thread per order. Participants:
--   customer  — owns the order
--   courier   — profile assigned to the delivery (deliveries.courier_id)
--   admin/vendor — Farmer's Choice staff, mediating between everyone
--
-- RLS is enabled with NO policies on purpose: direct anon/authenticated access
-- from the browser is denied. All reads/writes go through server route
-- handlers which verify participation explicitly and use the service role.
create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'courier', 'admin', 'vendor')),
  kind text not null default 'text' check (kind in ('text', 'photo', 'location')),
  body text,
  image_path text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_messages_order on public.order_messages(order_id, created_at);

alter table public.order_messages enable row level security;

-- Chat photo storage (private; served via signed URLs from the API) -----------
insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', false)
on conflict (id) do nothing;
