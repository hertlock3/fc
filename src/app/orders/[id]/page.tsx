import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BikeIcon,
  MapPin,
  Phone,
  Receipt,
  Store,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured, config } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderWithRelations } from "@/lib/queries";
import { getParticipant } from "@/lib/messages";
import { NotConfigured } from "@/components/not-configured";
import { OrderStatusBadge } from "@/components/status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { OrderChat } from "@/components/order-chat";
import { PayPanel } from "@/components/pay-panel";
import { LiveTrackingMapClient } from "@/components/live-tracking-map-client";
import { Badge, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { AddressSnapshot, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const supabase = await createClient();

  // Chat is available to the customer, the assigned rider and FC staff.
  // Resolve participation FIRST: only riders/staff (who RLS hides the order
  // from) may fall back to the service-role fetch — anyone else gets 404.
  const adminClient = createAdminClient();
  const participant = await getParticipant(adminClient, id, user.id);

  let order = await getOrderWithRelations(supabase, id);
  if (!order && participant && participant.role !== "customer") {
    order = await getOrderWithRelations(adminClient, id);
  }
  if (!order) notFound();

  const snapshot = order.delivery_address as AddressSnapshot | null;
  const delivery = order.deliveries?.[0];
  const customerInvoice = order.invoices?.find((i: Invoice) => i.kind === "customer");

  return (
    <div className="container-page py-10">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {order.order_number}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Placed {formatDateTime(order.created_at)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* Payment */}
          <section className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Phone className="h-4 w-4 text-brand-600" /> Payment
            </h2>
            <PayPanel
              orderId={order.id}
              totalCents={order.total_cents}
              moneyProvider={config.money.provider}
              status={order.status}
            />
            {order.mpesa_receipt && (
              <p className="mt-3 text-xs text-slate-500">
                M-Pesa receipt: <strong>{order.mpesa_receipt}</strong>
              </p>
            )}
          </section>

          {/* Delivery tracking */}
          <section className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <BikeIcon className="h-4 w-4 text-brand-600" /> Delivery
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <Store className="h-3.5 w-3.5" /> Pickup
                </p>
                <p className="mt-1.5 text-sm font-medium text-slate-800">
                  {order.stockist?.name ?? config.store.name}
                </p>
                <p className="text-xs text-slate-500">
                  {order.stockist?.address ?? config.store.address}
                  {order.stockist?.phone ? ` · ${order.stockist.phone}` : ""}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> Drop-off
                </p>
                <p className="mt-1.5 text-sm font-medium text-slate-800">
                  {snapshot?.line1 ?? "—"}
                  {snapshot?.area ? `, ${snapshot.area}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {snapshot?.city}
                  {order.distance_km != null ? ` · ${order.distance_km.toFixed(1)} km` : ""}
                </p>
              </div>
            </div>

            {delivery && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                <Badge tone="info">{delivery.provider.replace("_", " ")}</Badge>
                <Badge tone="neutral">{delivery.status.replace("_", " ")}</Badge>
                {delivery.courier_name && (
                  <span className="text-sm text-slate-700">
                    Rider: <strong>{delivery.courier_name}</strong>
                    {delivery.courier_phone ? ` · ${delivery.courier_phone}` : ""}
                  </span>
                )}
              </div>
            )}

            {order.status === "awaiting_vendor_approval" && (
              <p className="mt-4 text-sm text-slate-500">
                Waiting for Farmer&apos;s Choice to approve and pack your order. A rider
                is dispatched right after.
              </p>
            )}

            {/* Live rider tracking while the order is on the road. */}
            {order.stockist &&
              snapshot &&
              (order.status === "out_for_delivery" ||
                order.status === "dispatching" ||
                order.status === "delivered") && (
                <div className="mt-5">
                  <LiveTrackingMapClient
                    orderId={order.id}
                    initialPickup={
                      order.stockist
                        ? {
                            name: order.stockist.name,
                            lat: order.stockist.lat,
                            lng: order.stockist.lng,
                          }
                        : null
                    }
                    initialDropoff={
                      order.delivery_lat != null && order.delivery_lng != null
                        ? { lat: order.delivery_lat, lng: order.delivery_lng }
                        : null
                    }
                  />
                </div>
              )}
          </section>

          {/* Chat: customer ↔ rider ↔ FC staff */}
          {participant && (
            <section className="card p-5">
              <h2 className="mb-4 font-semibold text-slate-900">
                Delivery chat
                <span className="ml-2 text-xs font-normal text-slate-400">
                  customer · rider · FC support
                </span>
              </h2>
              <OrderChat orderId={order.id} />
            </section>
          )}

          {/* Timeline */}
          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Order timeline</h2>
            <OrderTimeline events={order.order_events ?? []} />
          </section>
        </div>

        {/* Invoice */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Receipt className="h-4 w-4 text-brand-600" /> Invoice
            </h2>
            {customerInvoice && (
              <p className="mt-1 text-xs text-slate-400">{customerInvoice.invoice_number}</p>
            )}

            <ul className="mt-4 space-y-2 border-b border-slate-100 pb-4 text-sm">
              {order.order_items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span className="text-slate-600">
                    {item.quantity} × {item.name}
                  </span>
                  <span className="font-medium text-slate-800">
                    {formatMoney(item.line_total_cents)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Goods subtotal</dt>
                <dd className="font-medium text-slate-800">
                  {formatMoney(order.subtotal_cents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Delivery</dt>
                <dd className="font-medium text-slate-800">
                  {formatMoney(order.delivery_fee_cents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Service fee</dt>
                <dd className="font-medium text-accent-700">
                  {formatMoney(order.service_fee_cents)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold text-slate-900">
              <span>Total</span>
              <span>{formatMoney(order.total_cents)}</span>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Farmer&apos;s Choice payout after the {config.serviceFee.percent}% service
              fee: <strong>{formatMoney(order.vendor_payout_cents)}</strong>
            </div>

            <Link
              href="/shop"
              className={buttonClass("secondary", "md", "mt-5 w-full")}
            >
              Order again
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
