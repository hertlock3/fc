import Link from "next/link";
import { ClipboardList, Coffee, Truck, Store } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured, config } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOrders } from "@/lib/queries";
import { listActiveStockists } from "@/lib/stockists";
import { NotConfigured } from "@/components/not-configured";
import { OrderStatusBadge } from "@/components/status-badge";
import { AdminOrderActions, type StockistOption } from "@/components/admin-order-actions";
import { AdminNav } from "@/components/admin-nav";
import { Badge, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { AddressSnapshot, Order, Stockist } from "@/lib/types";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();
  const supabase = await createClient();

  const [pending, active, recent, courierRows, stockistRows] = await Promise.all([
    listOrders(supabase, { statuses: ["awaiting_vendor_approval"], limit: 100 }),
    listOrders(supabase, {
      statuses: ["vendor_approved", "dispatching", "out_for_delivery"],
      limit: 100,
    }),
    listOrders(supabase, { statuses: ["delivered", "cancelled", "refunded"], limit: 8 }),
    supabase.from("profiles").select("id, full_name, phone").eq("role", "courier"),
    listActiveStockists(createAdminClient()),
  ]);
  const couriers = (courierRows.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    phone: string | null;
  }>;
  // Stockist options for the fulfil-from selector (principal first).
  const stockists: StockistOption[] = (stockistRows as Stockist[])
    .map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      is_principal: s.is_principal,
      is_active: s.is_active,
    }))
    .sort((a, b) => Number(b.is_principal) - Number(a.is_principal));

  const totalPlatformFees = recent.reduce((sum, o) => sum + o.platform_fee_cents, 0);

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Operations dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Approve orders, dispatch riders and monitor the fulfilment queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Money: {config.money.provider}</Badge>
          <Badge tone="info">Courier: {config.delivery.provider}</Badge>
        </div>
      </div>

      <div className="mt-6">
        <AdminNav active="dashboard" />
      </div>

      {/* Stat strip */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={ClipboardList}
          label="Awaiting approval"
          value={String(pending.length)}
          tone="warning"
        />
        <Stat
          icon={Truck}
          label="In fulfilment"
          value={String(active.length)}
          tone="info"
        />
        <Stat
          icon={Coffee}
          label="Platform fees (recent)"
          value={formatMoney(totalPlatformFees, "KES")}
          tone="success"
        />
      </div>

      <Section
        title="Awaiting Farmer's Choice approval"
        orders={pending}
        empty="Nothing waiting for approval."
        couriers={couriers}
        stockists={stockists}
      />
      <Section
        title="In fulfilment"
        orders={active}
        empty="No orders are out for delivery."
        couriers={couriers}
        stockists={stockists}
      />

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">Recently completed</h2>
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {recent.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/orders/${order.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-700">
                  {order.order_number}
                </Link>
                <div className="flex items-center gap-3">
                  <OrderStatusBadge status={order.status} />
                  <span className="text-sm font-medium text-slate-700">
                    {formatMoney(order.total_cents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  orders,
  empty,
  couriers,
  stockists,
}: {
  title: string;
  orders: Order[];
  empty: string;
  couriers: Array<{ id: string; full_name: string | null; phone: string | null }>;
  stockists: StockistOption[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
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
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {order.order_number}
                        </Link>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(order.created_at)} ·{" "}
                        {snapshot?.line1 ?? "—"}
                        {snapshot?.area ? `, ${snapshot.area}` : ""}
                        {order.distance_km != null ? ` · ${order.distance_km.toFixed(1)} km` : ""}
                      </p>
                      {order.stockist && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-700">
                          <Store className="h-3.5 w-3.5" /> Fulfilled from{" "}
                          <strong className="font-medium">{order.stockist.name}</strong>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {formatMoney(order.total_cents)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Payout {formatMoney(order.vendor_payout_cents)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <AdminOrderActions
                      orderId={order.id}
                      status={order.status}
                      couriers={couriers}
                      stockists={stockists}
                      currentStockistId={order.stockist_id}
                    />
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

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "warning" | "info" | "success";
}) {
  const tones = {
    warning: "bg-accent-50 text-accent-700",
    info: "bg-sky-50 text-sky-700",
    success: "bg-brand-50 text-brand-700",
  } as const;
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
