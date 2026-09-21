import { requireApiAdmin, json, apiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/money";

/**
 * Admin financials API — aggregated money flows across ALL orders.
 *
 * Money destination breakdown (per platform's split):
 *   - goods      → Farmer's Choice payout (vendor_payout_cents)
 *   - delivery   → courier rider account (delivery_fee_cents)
 *   - service    → platform service charge (service_fee_cents)
 *
 * Only PAID money counts: orders with payment_status "paid" (delivered,
 * awaiting approval, etc.). Cancelled/refunded orders are excluded.
 */

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select(
      "total_cents, subtotal_cents, delivery_fee_cents, service_fee_cents, " +
      "vendor_payout_cents, platform_fee_cents, payment_status, status, created_at"
    )
    .eq("payment_status", "paid");

  if (error) return apiError(error.message, 500);
  const orders = (data ?? []) as unknown as Array<{
    total_cents: number;
    subtotal_cents: number;
    delivery_fee_cents: number;
    service_fee_cents: number;
    vendor_payout_cents: number;
    platform_fee_cents: number;
    payment_status: string;
    status: string;
    created_at: string;
  }>;

  const sum = (fn: (o: (typeof orders)[number]) => number) =>
    orders.reduce((acc, o) => acc + fn(o), 0);

  const totals = {
    gross: sum((o) => o.total_cents),
    goods: sum((o) => o.subtotal_cents),
    delivery: sum((o) => o.delivery_fee_cents),
    serviceFee: sum((o) => o.service_fee_cents),
    vendorPayout: sum((o) => o.vendor_payout_cents),
    platformFee: sum((o) => o.platform_fee_cents),
    orderCount: orders.length,
  };

  // Where the money goes (shares of gross paid volume).
  const breakdown = [
    { key: "goods", label: "Farmer's Choice (goods)", cents: totals.vendorPayout },
    { key: "delivery", label: "Courier rider account", cents: totals.delivery },
    { key: "service", label: "Platform service charge", cents: totals.platformFee },
  ];

  // Monthly gross volume (last 6 months) for the bar chart.
  const byMonth = new Map<string, number>();
  for (const o of orders) {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + o.total_cents);
  }
  const monthly = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, cents]) => ({ month, cents }));

  return json({
    totals: {
      ...totals,
      formatted: {
        gross: formatMoney(totals.gross),
        vendorPayout: formatMoney(totals.vendorPayout),
        delivery: formatMoney(totals.delivery),
        platformFee: formatMoney(totals.platformFee),
      },
    },
    breakdown,
    monthly,
  });
}
