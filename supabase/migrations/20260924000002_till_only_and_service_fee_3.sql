-- ============================================================================
-- Farmer's Choice Market — receiving account is a TILL (Buy Goods) only, and
-- the platform service fee is 3% everywhere.
--
-- 1. Restate historical orders that were charged at the previous 5% service
--    fee. Newer orders (already at 3%) are left untouched; the recomputation
--    uses exactly the same formula as src/lib/pricing.ts (Math.round of
--    base × percent / 100) so no discrepancies remain between stored money
--    splits and the app's pricing engine.
--    Affected rows: orders, customer invoices (incl. meta.service_fee_percent)
--    and the pending/processing payment amount, if any. Vendor invoices hold
--    goods only and are unaffected by definition.
-- 2. Rename the merchant settings key `paybill` → `till` (receiving account is
--    a till number only), preserving the stored value. Also seeds a pricing
--    settings row at 3% for fresh installs.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restate the 5% era to 3%
-- ---------------------------------------------------------------------------

-- orders: recompute fee, total, platform fee from the same base checkout used.
update public.orders
set service_fee_cents  = round((subtotal_cents + delivery_fee_cents) * 3 / 100.0),
    total_cents        = subtotal_cents + delivery_fee_cents
                         + round((subtotal_cents + delivery_fee_cents) * 3 / 100.0),
    platform_fee_cents = round((subtotal_cents + delivery_fee_cents) * 3 / 100.0)
where payment_status in ('paid', 'processing', 'pending')
  and service_fee_cents <> round((subtotal_cents + delivery_fee_cents) * 3 / 100.0);

-- customer invoices: amounts + the recorded percent in meta.
update public.invoices
set service_fee_cents = round((subtotal_cents + delivery_fee_cents) * 3 / 100.0),
    total_cents       = subtotal_cents + delivery_fee_cents
                        + round((subtotal_cents + delivery_fee_cents) * 3 / 100.0),
    meta = jsonb_set(
      coalesce(meta, '{}'::jsonb),
      '{service_fee_percent}',
      '3'::jsonb,
      true
    )
where kind = 'customer'
  and service_fee_cents <> round((subtotal_cents + delivery_fee_cents) * 3 / 100.0);

-- payments not yet finalised follow the order's new total.
update public.payments p
set amount_cents = o.total_cents,
    updated_at   = now()
from public.orders o
where p.order_id = o.id
  and p.status in ('pending', 'processing')
  and p.amount_cents <> o.total_cents;

-- ---------------------------------------------------------------------------
-- 2. Receiving account: till only
-- ---------------------------------------------------------------------------

-- Preserve an admin-amended value under the new key name, then drop the old.
update public.settings
set value = jsonb_build_object(
      'till', value->>'paybill',
      'accountPrefix', coalesce(value->>'accountPrefix', 'FCM'),
      'name', coalesce(value->>'name', 'Farmer''s Choice Market Ltd')
    ),
    updated_at = now()
where key = 'merchant'
  and value ? 'paybill';

-- Fresh installs get a pricing row at 3% (matches supabase/seed.sql).
insert into public.settings (key, value)
values ('pricing', '{"serviceFeePercent":3,"delivery":{"baseFee":100,"perKmFee":35,"minFee":130,"maxFee":1500,"peakMultiplier":1.15}}'::jsonb)
on conflict (key) do nothing;
