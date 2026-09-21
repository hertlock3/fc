import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/status-badge";
import type { Order } from "@/lib/types";

/**
 * Shared all-orders table with status tabs and search, used by both
 * /admin/orders and (for admins) /orders. The page passes ALL orders
 * (latest 500); tab and search filtering happen here so tab counts stay
 * consistent. Server component: plain links + a GET form, no client JS.
 */

export const ORDER_TABS: Array<{ key: string; label: string; statuses: string[] | null }> = [
  { key: "all", label: "All", statuses: null },
  { key: "awaiting_vendor_approval", label: "Awaiting approval", statuses: ["awaiting_vendor_approval"] },
  { key: "vendor_approved", label: "Approved", statuses: ["vendor_approved", "dispatching"] },
  { key: "out_for_delivery", label: "Out for delivery", statuses: ["out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled", "refunded"] },
  { key: "pending_payment", label: "Unpaid", statuses: ["pending_payment", "paid"] },
];

export interface OrderRow extends Order {
  order_items: Array<{ id: string; name: string; quantity: number }>;
  profile: { full_name: string | null } | null;
}

function isAll(statuses: string[] | null) {
  return statuses === null;
}

/** Search predicate matching order number, customer name, or line-item name. */
function matches(order: OrderRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const items = order.order_items ?? [];
  return (
    order.order_number.toLowerCase().includes(needle) ||
    (order.profile?.full_name ?? "").toLowerCase().includes(needle) ||
    items.some((i) => i.name.toLowerCase().includes(needle))
  );
}

function itemsSummary(order: OrderRow): string {
  const items = order.order_items ?? [];
  if (items.length === 0) return "no line items";
  if (items.length === 1) return `${items[0].name} ×${items[0].quantity ?? 1}`;
  return `${items[0].name} + ${items.length - 1} more`;
}

function PaymentBadge({ status }: { status: Order["payment_status"] }) {
  const tone =
    status === "paid"
      ? "bg-brand-50 text-brand-700 ring-brand-200"
      : status === "failed" || status === "cancelled"
        ? "bg-red-50 text-red-700 ring-red-200"
        : status === "processing"
          ? "bg-sky-50 text-sky-700 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function OrdersTable({
  orders,
  tab,
  q,
  basePath,
}: {
  orders: OrderRow[];
  /** Active tab key (defaults to "all"). */
  tab?: string;
  /** Current search query. */
  q?: string;
  /** Where tab links and the search form submit to, e.g. "/admin/orders". */
  basePath: string;
}) {
  const activeTab = ORDER_TABS.some((t) => t.key === tab) ? tab! : "all";
  const search = q ?? "";
  const tabStatuses = ORDER_TABS.find((t) => t.key === activeTab)?.statuses ?? null;

  // Tab + search filtering happen here so counts are always consistent.
  const visible = orders
    .filter((o) => (tabStatuses ? tabStatuses.includes(o.status) : true))
    .filter((o) => matches(o, search));

  // Tab counts reflect the search-filtered set so numbers stay consistent.
  const countFor = (key: string) => {
    const t = ORDER_TABS.find((x) => x.key === key)!;
    if (isAll(t.statuses)) return visible.length;
    return visible.filter((o) => t.statuses!.includes(o.status)).length;
  };

  const hrefFor = (key: string) =>
    `${basePath}?tab=${key}${search ? `&q=${encodeURIComponent(search)}` : ""}`;

  return (
    <div>
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {ORDER_TABS.map((t) => (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activeTab === t.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                activeTab === t.key ? "bg-white/20" : "bg-slate-100"
              }`}
            >
              {countFor(t.key)}
            </span>
          </Link>
        ))}
      </div>

      {/* Search */}
      <form className="mt-4 flex max-w-md gap-2" action={basePath} method="get">
        <input type="hidden" name="tab" value={activeTab} />
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search order #, customer or product…"
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Search
        </button>
      </form>

      {/* Orders table */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Placed</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((order) => {
              const snapshot = order.delivery_address as
                | { line1?: string | null }
                | null;
              return (
                <tr key={order.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {order.order_number}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {itemsSummary(order)}
                      {snapshot?.line1 ? ` · ${snapshot.line1}` : ""}
                    </p>
                    {order.stockist?.name && (
                      <p className="mt-0.5 text-xs text-brand-700">
                        {order.stockist.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {order.profile?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(order.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={order.payment_status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatMoney(order.total_cents)}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No orders match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {visible.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Showing {visible.length} of {orders.length} orders (latest 500).
        </p>
      )}
    </div>
  );
}
