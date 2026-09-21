import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  ClipboardList,
  MapPin,
  Package,
  Phone,
  Store,
  Truck,
} from "lucide-react";
import { requireStockist } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderStatusBadge } from "@/components/status-badge";
import { AdminNav } from "@/components/admin-nav";
import { Badge, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { AddressSnapshot, Order, OrderWithRelations, Stockist } from "@/lib/types";

export const metadata = { title: "Stockist dashboard" };
export const dynamic = "force-dynamic";

/**
 * Stockist partner dashboard — everything a stockist needs to fulfil orders:
 * incoming orders routed to them, the customer/delivery details for each, and
 * a payments summary of what they've sold (their goods payout, the platform
 * keeping its service fee).
 */
export default async function StockistDashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Store setup incomplete" />
      </div>
    );
  }

  const { user, stockist } = await requireStockist();
  const admin = createAdminClient();

  // Orders routed to this stockist, newest first. The service-role client is
  // used because the stockist's session may not satisfy RLS before staff
  // verify the location; the query is scoped strictly to stockist_id.
  const { data: orderRows } = await admin
    .from("orders")
    .select(
      "*, order_items (*), profile:profiles (full_name, phone), stockist:stockists (id, name)"
    )
    .eq("stockist_id", stockist.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = ((orderRows ?? []) as unknown as OrderWithRelations[]).map((o) => {
    const s = (o as unknown as { stockist?: unknown }).stockist;
    return { ...o, stockist: Array.isArray(s) ? (s[0] ?? null) : (s ?? null) };
  });

  const awaiting = orders.filter(
    (o) => o.status === "awaiting_vendor_approval" || o.status === "vendor_approved"
  );
  const onTheWay = orders.filter((o) =>
    ["dispatching", "out_for_delivery"].includes(o.status)
  );
  const done = orders.filter((o) =>
    ["delivered", "cancelled", "refunded"].includes(o.status)
  );

  // Payments: the stockist earns the goods value; the platform keeps its fee.
  const paidOrders = orders.filter((o) => o.payment_status === "paid");
  const goodsValue = paidOrders.reduce((sum, o) => sum + o.subtotal_cents, 0);
  const todayPaid = paidOrders.filter(
    (o) => o.paid_at && new Date(o.paid_at).toDateString() === new Date().toDateString()
  );
  const todayGoods = todayPaid.reduce((sum, o) => sum + o.subtotal_cents, 0);

  return (
    <div className="container-page py-10">
      {/* Header with verification banner */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Store className="h-6 w-6 text-brand-600" /> {stockist.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stockist.address}
            {stockist.city ? `, ${stockist.city}` : ""} · {stockist.opening_hours ?? "hours not set"}
          </p>
        </div>
        {stockist.is_active ? (
          <Badge tone="success">Active — taking orders</Badge>
        ) : (
          <Badge tone="warning">Pending verification</Badge>
        )}
      </div>

      {!stockist.is_active && (
        <div className="mt-4 rounded-xl bg-accent-50 p-4 text-sm text-accent-800">
          Your location is registered but not yet verified by Farmer&apos;s Choice.
          Orders will be routed here once staff activate it in the admin dashboard
          (usually within one business day).
        </div>
      )}

      {/* Payments summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={Banknote}
          label="Today's sales"
          value={formatMoney(todayGoods)}
          sub={`${todayPaid.length} paid order${todayPaid.length === 1 ? "" : "s"}`}
        />
        <Stat
          icon={ClipboardList}
          label="Orders to fulfil"
          value={String(awaiting.length)}
          sub="approve & pack"
        />
        <Stat
          icon={Truck}
          label="On the road"
          value={String(onTheWay.length)}
          sub="with riders"
        />
      </div>

      {/* Fulfilment guide */}
      <section className="mt-8 card p-5">
        <h2 className="font-semibold text-slate-900">How your orders work</h2>
        <ol className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-4">
          <li className="rounded-xl bg-slate-50 p-3">
            <strong className="text-slate-800">1. Order arrives.</strong> Routed to
            you as the nearest stockist (staff can re-route).
          </li>
          <li className="rounded-xl bg-slate-50 p-3">
            <strong className="text-slate-800">2. Pack it.</strong> FC staff approve
            after payment; you pack the items.
          </li>
          <li className="rounded-xl bg-slate-50 p-3">
            <strong className="text-slate-800">3. Rider collects.</strong> Dispatched
            from your location; chat is available per order.
          </li>
          <li className="rounded-xl bg-slate-50 p-3">
            <strong className="text-slate-800">4. Get paid.</strong> You receive the
            goods value; the platform keeps its {""}
            service fee.
          </li>
        </ol>
      </section>

      {/* Orders to fulfil */}
      <OrdersSection
        title="Orders to fulfil"
        icon={ClipboardList}
        orders={awaiting}
        empty="No orders waiting — new ones arrive here automatically."
      />

      {/* On the road */}
      <OrdersSection
        title="With riders"
        icon={Truck}
        orders={onTheWay}
        empty="No orders in transit right now."
      />

      {/* Completed */}
      <OrdersSection
        title="Completed"
        icon={Package}
        orders={done.slice(0, 10)}
        empty="No completed orders yet."
      />

      {/* Payments breakdown */}
      <section className="mt-10 card p-5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Banknote className="h-4 w-4 text-brand-600" /> Payments
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Goods value (paid orders)
            </dt>
            <dd className="mt-1 text-lg font-bold text-slate-900">
              {formatMoney(goodsValue)}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Delivery collected (passes to riders)
            </dt>
            <dd className="mt-1 text-lg font-bold text-slate-900">
              {formatMoney(paidOrders.reduce((s, o) => s + o.delivery_fee_cents, 0))}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Platform service fee
            </dt>
            <dd className="mt-1 text-lg font-bold text-slate-900">
              {formatMoney(paidOrders.reduce((s, o) => s + o.platform_fee_cents, 0))}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Payouts are settled to your bank/M-Pesa by Farmer&apos;s Choice finance —
          the same totals appear on each order&apos;s vendor invoice.
        </p>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">
          {label}
          {sub ? ` · ${sub}` : ""}
        </p>
      </div>
    </div>
  );
}

function OrdersSection({
  title,
  icon: Icon,
  orders,
  empty,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  orders: OrderWithRelations[];
  empty: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-brand-600" /> {title}
      </h2>
      <div className="mt-4">
        {orders.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => {
              const snapshot = order.delivery_address as AddressSnapshot | null;
              return (
                <li key={order.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {order.order_number}
                        </Link>
                        <OrderStatusBadge status={order.status} />
                        {order.payment_status === "paid" && (
                          <Badge tone="success">Paid</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(order.created_at)}
                      </p>
                      {/* Customer & delivery info the stockist needs to pack/collate */}
                      <div className="mt-2 grid gap-1 text-sm text-slate-600">
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {order.profile?.full_name ?? "Customer"}
                          {order.profile?.phone ? ` · ${order.profile.phone}` : ""}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {snapshot?.line1 ?? "—"}
                          {snapshot?.area ? `, ${snapshot.area}` : ""} ·{" "}
                          {snapshot?.city}
                        </p>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                        {(order.order_items ?? []).slice(0, 4).map((item) => (
                          <li key={item.id}>
                            {item.quantity} × {item.name}
                          </li>
                        ))}
                        {(order.order_items?.length ?? 0) > 4 && (
                          <li>+ {(order.order_items?.length ?? 0) - 4} more items</li>
                        )}
                      </ul>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {formatMoney(order.total_cents)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Goods {formatMoney(order.subtotal_cents)}
                      </p>
                      <Link
                        href={`/orders/${order.id}`}
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                      >
                        Details <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
