import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, BikeIcon, ClipboardList, MapPin, Package, Store, Wallet } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOrders } from "@/lib/queries";
import { OrderStatusBadge } from "@/components/status-badge";
import { CourierTripActions } from "@/components/courier-trip-actions";
import { LocationBeacon } from "@/components/location-beacon";
import { Badge, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { AddressSnapshot, OrderStatus } from "@/lib/types";

export const metadata = { title: "Courier trips" };
export const dynamic = "force-dynamic";

/**
 * Courier portal — trips assigned to the signed-in rider: pickup/drop-off,
 * line items (manifest), trip cost (delivery fee) and a link to the order
 * chat where they can talk to the customer and share live location.
 */
export default async function CourierPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Store setup incomplete" />
      </div>
    );
  }

  const user = await requireUser("/courier");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;

  // Couriers land here; staff may preview the portal too.
  if (role !== "courier" && !(await isAdmin(user.id))) {
    redirect("/shop");
  }

  // Trips assigned to this rider, newest first. Uses the service-role client
  // because RLS (correctly) hides other people's orders from the courier's
  // session — the query is still scoped strictly to courier_id = their id.
  const { data: deliveries } = await createAdminClient()
    .from("deliveries")
    .select("id, order_id, status, fee_cents, created_at, order:orders(order_number, status, created_at, delivery_address, distance_km, stockist:stockists(name, address, city))")
    .eq("courier_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const trips = (deliveries ?? []).map((d) => {
    const row = d as unknown as {
      id: string;
      order_id: string;
      status: string;
      fee_cents: number;
      created_at: string;
      order:
        | {
            order_number: string;
            status: string;
            created_at: string;
            delivery_address: AddressSnapshot | null;
            distance_km: number | null;
            stockist:
              | { name: string; address: string; city: string }
              | Array<{ name: string; address: string; city: string }>
              | null;
          }
        | Array<{
            order_number: string;
            status: string;
            created_at: string;
            delivery_address: AddressSnapshot | null;
            distance_km: number | null;
            stockist:
              | { name: string; address: string; city: string }
              | Array<{ name: string; address: string; city: string }>
              | null;
          }>
        | null;
    };
    // PostgREST returns the to-one embed as an object; handle both shapes.
    const order = Array.isArray(row.order) ? (row.order[0] ?? null) : (row.order ?? null);
    const stockist = order?.stockist;
    return {
      ...row,
      order: order
        ? {
            ...order,
            stockist: Array.isArray(stockist) ? (stockist[0] ?? null) : (stockist ?? null),
          }
        : null,
    };
  });

  const active = trips.filter((t) => ["assigned", "picked_up", "delivering"].includes(t.status));
  const done = trips.filter((t) => !["assigned", "picked_up", "delivering"].includes(t.status));

  // Earnings: the delivery fee on each trip, split by payment/settlement state.
  const todayEarnings = active.concat(done)
    .filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, t) => sum + t.fee_cents, 0);
  const deliveredTrips = done.filter((t) => t.status === "delivered");
  const lifetimeEarnings = deliveredTrips.reduce((sum, t) => sum + t.fee_cents, 0);
  const weekCutoff = new Date();
  weekCutoff.setDate(weekCutoff.getDate() - 7);
  const thisWeek = deliveredTrips.filter((t) => new Date(t.created_at) >= weekCutoff);

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My trips</h1>
          <p className="mt-1 text-sm text-slate-500">
            Orders assigned to you for delivery. Chat with the customer from the order page.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="info">{active.length} active</Badge>
          <Badge tone="success">Today: {formatMoney(todayEarnings, "KES")}</Badge>
        </div>
      </div>

      {/* Earnings summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-900">{formatMoney(lifetimeEarnings)}</p>
            <p className="text-xs text-slate-500">Delivered trips (total)</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-900">{deliveredTrips.length}</p>
            <p className="text-xs text-slate-500">Trips completed</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-accent-700">
            <Banknote className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xl font-bold text-slate-900">{formatMoney(thisWeek.reduce((s, t) => s + t.fee_cents, 0))}</p>
            <p className="text-xs text-slate-500">This week ({thisWeek.length} trips)</p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Earnings = delivery fee per trip. Payouts are settled by Farmer&apos;s Choice
        finance to your registered number.
      </p>

      <TripsSection
        title="Active trips"
        trips={active}
        empty="No active trips — new assignments appear here."
      />
      <TripsSection title="Completed" trips={done} empty="No completed trips yet." />
    </div>
  );
}

interface Trip {
  id: string;
  order_id: string;
  status: string;
  fee_cents: number;
  created_at: string;
  order: {
    order_number: string;
    status: string;
    created_at: string;
    delivery_address: AddressSnapshot | null;
    distance_km: number | null;
    stockist: { name: string; address: string; city: string } | null;
  } | null;
}

function TripsSection({
  title,
  trips,
  empty,
}: {
  title: string;
  trips: Trip[];
  empty: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">
        {trips.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <ul className="space-y-3">
            {trips.map((trip) => {
              const snapshot = trip.order?.delivery_address as AddressSnapshot | null;
              return (
                <li key={trip.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/orders/${trip.order_id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700"
                      >
                        {trip.order?.order_number ?? trip.order_id.slice(0, 8)}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        Assigned {formatDateTime(trip.created_at)}
                      </p>
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                        <Store className="h-3.5 w-3.5 text-brand-600" /> Pickup:{" "}
                        {trip.order?.stockist?.name ?? "Farmer&apos;s Choice"}
                        {trip.order?.stockist?.address
                          ? ` — ${trip.order.stockist.address}`
                          : ""}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                        <MapPin className="h-3.5 w-3.5 text-accent-600" /> Drop-off:{" "}
                        {snapshot?.line1 ?? "—"}
                        {snapshot?.area ? `, ${snapshot.area}` : ""} · {snapshot?.city}
                        {trip.order?.distance_km != null
                          ? ` (${trip.order.distance_km.toFixed(1)} km)`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <OrderStatusBadge
                        status={(trip.order?.status ?? "pending_payment") as OrderStatus}
                      />
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        Trip cost: {formatMoney(trip.fee_cents)}
                      </p>
                    </div>
                  </div>
                  {title === "Active trips" && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <CourierTripActions
                        orderId={trip.order_id}
                        deliveryStatus={trip.status}
                      />
                      <LocationBeacon orderId={trip.order_id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
