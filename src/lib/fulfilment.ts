import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";
import {
  getDeliveryProvider,
  type DeliveryAddress,
} from "@/lib/providers/delivery";
import { canTransition, logOrderEvent } from "@/lib/orders";
import { normalizeKenyanPhone } from "@/lib/utils";
import { getStockistById } from "@/lib/stockists";
import { getRoadDistanceKm } from "@/lib/pricing";
import type { AddressSnapshot, DeliveryStatus, Order } from "@/lib/types";

/**
 * Farmer's Choice approves an order, releasing it for dispatch.
 * awaiting_vendor_approval → vendor_approved
 *
 * `stockistId` lets staff override the auto-nearest fulfilment location
 * before approval — e.g. when a stockist calls in short of stock. The
 * delivery fee is NOT silently recomputed on override; use
 * `reassignStockist` when the fee should follow the new origin.
 */
export async function approveOrder(
  admin: SupabaseClient,
  orderId: string,
  actor: string,
  stockistId?: string | null
): Promise<void> {
  const order = await getOrder(admin, orderId);
  if (!canTransition(order.status, "vendor_approved")) {
    throw new Error(`Cannot approve an order in status "${order.status}".`);
  }
  if (stockistId && stockistId !== order.stockist_id) {
    await admin
      .from("orders")
      .update({ stockist_id: stockistId })
      .eq("id", orderId);
    await logOrderEvent(
      admin,
      orderId,
      "stockist_changed",
      "Fulfilment stockist changed by staff before approval.",
      actor,
      { from: order.stockist_id, to: stockistId }
    );
  }
  await admin
    .from("orders")
    .update({ status: "vendor_approved", approved_at: new Date().toISOString() })
    .eq("id", orderId);
  await admin
    .from("invoices")
    .update({ status: "settled" })
    .eq("order_id", orderId)
    .eq("kind", "vendor");
  await logOrderEvent(
    admin,
    orderId,
    "vendor_approved",
    "Farmer's Choice approved the order. Preparing items for pickup.",
    actor
  );
}

/**
 * Move an order to a different stockist AFTER it has been placed.
 *
 * Recomputes the distance-based delivery fee from the new origin and
 * updates order + customer invoice totals so the customer always pays for
 * the real distance. Blocked once a rider is on the road (or beyond) —
 * cancel and re-place instead.
 */
export async function reassignStockist(
  admin: SupabaseClient,
  orderId: string,
  newStockistId: string,
  actor: string
): Promise<void> {
  const order = await getOrder(admin, orderId);
  if (
    ["out_for_delivery", "delivered", "cancelled", "refunded"].includes(
      order.status
    )
  ) {
    throw new Error(
      `Cannot re-route an order that is "${order.status}". Cancel and re-place instead.`
    );
  }
  if (newStockistId === order.stockist_id) return;

  const { data: stockist } = await admin
    .from("stockists")
    .select("id, name, lat, lng, is_active")
    .eq("id", newStockistId)
    .maybeSingle();
  if (!stockist) throw new Error("Stockist not found.");
  if (!(stockist as { is_active: boolean }).is_active) {
    throw new Error("That stockist is inactive and cannot take orders.");
  }

  const snapshot = order.delivery_address as AddressSnapshot | null;
  if (!snapshot) throw new Error("Order is missing a delivery address.");

  const distanceKm = await getRoadDistanceKm(
    { lat: (stockist as { lat: number }).lat, lng: (stockist as { lng: number }).lng },
    { lat: snapshot.lat, lng: snapshot.lng }
  );
  // Same fee model as checkout: base + per-km, peak-adjusted, clamped,
  // rounded to a whole shilling. Load DB pricing overrides when present.
  const { loadPricingSettings } = await import("@/lib/settings");
  const settings = await loadPricingSettings(admin);
  const { computeDeliveryFee } = await import("@/lib/pricing");
  const delivery_fee_cents = computeDeliveryFee(distanceKm, settings);
  const delta = delivery_fee_cents - order.delivery_fee_cents;
  const total_cents = order.total_cents + delta;
  const service_fee_cents = Math.round(
    order.service_fee_cents *
      (order.subtotal_cents + delivery_fee_cents) /
      Math.max(1, order.subtotal_cents + order.delivery_fee_cents)
  );

  await admin
    .from("orders")
    .update({ stockist_id: newStockistId, distance_km: distanceKm, delivery_fee_cents, service_fee_cents, total_cents })
    .eq("id", orderId);
  await admin
    .from("invoices")
    .update({
      delivery_fee_cents,
      service_fee_cents,
      total_cents,
    })
    .eq("order_id", orderId)
    .eq("kind", "customer");
  await logOrderEvent(
    admin,
    orderId,
    "stockist_changed",
    `Fulfilment re-routed to ${(stockist as { name: string }).name}. Delivery fee recalculated (${delta >= 0 ? "+" : ""}${(delta / 100).toFixed(2)} KES).`,
    actor,
    { from: order.stockist_id, to: newStockistId, distance_km: distanceKm, delivery_fee_cents }
  );
}

/**
 * Dispatch a rider for an approved order.
 * vendor_approved/dispatching → out_for_delivery
 *
 * Pass a registered `courierProfileId` (or a name-only ad-hoc rider) to
 * assign and dispatch in one step — the delivery row is created directly in
 * `assigned` state so the rider immediately gets the trip, chat and the
 * live-location beacon.
 */
export async function dispatchOrder(
  admin: SupabaseClient,
  orderId: string,
  actor: string,
  courier?: {
    /** profiles.id of a registered courier — enables chat + courier portal. */
    profileId?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null
): Promise<{ provider: string; courierName: string | null; courierPhone: string | null }> {
  const order = await getOrder(admin, orderId);
  if (order.status !== "vendor_approved" && order.status !== "dispatching") {
    throw new Error(`Order must be approved before dispatch (current: ${order.status}).`);
  }

  const snapshot = order.delivery_address as AddressSnapshot | null;
  if (!snapshot) throw new Error("Order is missing a delivery address.");

  // Every order is fulfilled from a stockist (the principal Ruiru plant is the
  // fallback for orders placed before stockists existed).
  const stockist = await getStockistById(admin, order.stockist_id);
  const pickup: DeliveryAddress = {
    name: stockist.name,
    phone: stockist.phone ?? config.store.phone,
    line1: stockist.address,
    city: stockist.city,
    lat: stockist.lat,
    lng: stockist.lng,
  };
  const dropoff: DeliveryAddress = {
    name: snapshot.recipient || "Customer",
    phone: snapshot.phone,
    line1: snapshot.line1,
    area: snapshot.area,
    city: snapshot.city,
    lat: snapshot.lat,
    lng: snapshot.lng,
    notes: snapshot.notes,
  };

  // Mark as dispatching while we talk to the courier.
  if (order.status === "vendor_approved") {
    await admin.from("orders").update({ status: "dispatching" }).eq("id", orderId);
  }

  const provider = getDeliveryProvider();
  const result = await provider.createDelivery({
    orderId,
    orderNumber: order.order_number,
    pickup,
    dropoff,
    manifest: `Farmer's Choice groceries · ${stockist.name}`,
    feeCents: order.delivery_fee_cents,
  });

  // One-step assignment: when staff picked a rider at dispatch time, stamp
  // them onto the delivery immediately instead of a second assign_rider call.
  const assignedName = courier?.name?.trim() || result.courierName;
  const assignedPhone = courier?.phone
    ? normalizeKenyanPhone(courier.phone) || courier.phone
    : result.courierPhone;

  await admin.from("deliveries").insert({
    order_id: orderId,
    provider: result.provider,
    external_id: result.externalId,
    status: courier?.profileId || assignedName ? "assigned" : result.status,
    courier_name: assignedName,
    courier_phone: assignedPhone,
    courier_id: courier?.profileId ?? null,
    tracking_url: result.trackingUrl,
    fee_cents: order.delivery_fee_cents,
    pickup,
    dropoff,
    raw: result.raw,
  });

  await admin
    .from("orders")
    .update({
      status: "out_for_delivery",
      delivery_provider: result.provider,
      delivery_external_id: result.externalId,
      delivery_status: courier?.profileId || assignedName ? "assigned" : result.status,
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await logOrderEvent(
    admin,
    orderId,
    "dispatched",
    assignedName
      ? `Rider ${assignedName} dispatched from ${stockist.name} for delivery.`
      : "Delivery requested. A rider is being assigned.",
    actor,
    { provider: result.provider, external_id: result.externalId }
  );

  return {
    provider: result.provider,
    courierName: assignedName,
    courierPhone: assignedPhone,
  };
}

/**
 * Assign a rider to a delivery.
 * `courierProfileId` (a profiles.id with the courier role) enables the
 * courier portal + order chat; name/phone alone only label the delivery.
 */
export async function assignRider(
  admin: SupabaseClient,
  orderId: string,
  actor: string,
  courierName: string,
  courierPhone?: string | null,
  courierProfileId?: string | null
): Promise<void> {
  const phone = courierPhone ? normalizeKenyanPhone(courierPhone) : null;
  await admin
    .from("deliveries")
    .update({
      status: "assigned",
      courier_name: courierName,
      courier_phone: phone ?? courierPhone ?? null,
      courier_id: courierProfileId ?? null,
    })
    .eq("order_id", orderId);
  await admin
    .from("orders")
    .update({ delivery_status: "assigned", status: "out_for_delivery", dispatched_at: new Date().toISOString() })
    .eq("id", orderId);
  await logOrderEvent(
    admin,
    orderId,
    "rider_assigned",
    `Rider ${courierName} assigned to this delivery.`,
    actor
  );
}

/**
 * Courier status updates. Allowed transitions:
 *   assigned  → picked_up | delivering
 *   picked_up → delivering
 *   delivering→ delivered (which also completes the order)
 */
export async function courierUpdateDeliveryStatus(
  admin: SupabaseClient,
  orderId: string,
  courierId: string,
  next: "picked_up" | "delivering" | "delivered"
): Promise<void> {
  const { data: delivery } = await admin
    .from("deliveries")
    .select("id, status, courier_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const d = delivery as { id: string; status: DeliveryStatus; courier_id: string | null } | null;
  if (!d) throw new Error("No delivery exists for this order.");
  if (d.courier_id !== courierId) throw new Error("This trip is not assigned to you.");

  const allowed: Record<string, string[]> = {
    assigned: ["picked_up", "delivering"],
    picked_up: ["delivering"],
    delivering: ["delivered"],
  };
  if (!allowed[d.status]?.includes(next)) {
    throw new Error(`Cannot move from "${d.status}" to "${next}".`);
  }

  if (next === "delivered") {
    await markDelivered(admin, orderId, "courier");
    return;
  }

  await admin.from("deliveries").update({ status: next }).eq("id", d.id);
  await admin
    .from("orders")
    .update({ delivery_status: next })
    .eq("id", orderId);
  await logOrderEvent(
    admin,
    orderId,
    next,
    next === "picked_up" ? "Rider picked up the order from Farmer's Choice." : "Rider is on the way.",
    "courier"
  );
}

/** Mark an in-transit order as delivered. out_for_delivery → delivered */
export async function markDelivered(
  admin: SupabaseClient,
  orderId: string,
  actor: string
): Promise<void> {
  const order = await getOrder(admin, orderId);
  if (!canTransition(order.status, "delivered")) {
    throw new Error(`Cannot mark an order in status "${order.status}" as delivered.`);
  }
  await admin
    .from("orders")
    .update({
      status: "delivered",
      delivery_status: "delivered",
      delivered_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  await admin.from("deliveries").update({ status: "delivered" }).eq("order_id", orderId);
  await logOrderEvent(admin, orderId, "delivered", "Order delivered to the customer.", actor);
}

/** Cancel an order that has not yet been delivered. */
export async function cancelOrder(
  admin: SupabaseClient,
  orderId: string,
  actor: string,
  reason?: string
): Promise<void> {
  const order = await getOrder(admin, orderId);
  if (!canTransition(order.status, "cancelled")) {
    throw new Error(`Cannot cancel an order in status "${order.status}".`);
  }

  // Best-effort cancel at the courier.
  if (order.delivery_external_id) {
    try {
      await getDeliveryProvider().cancel(order.delivery_external_id, reason);
    } catch {
      // ignore — the delivery may already be complete
    }
  }

  await admin
    .from("orders")
    .update({ status: "cancelled", delivery_status: "cancelled" })
    .eq("id", orderId);
  await admin.from("invoices").update({ status: "void" }).eq("order_id", orderId);
  await logOrderEvent(
    admin,
    orderId,
    "cancelled",
    reason ? `Order cancelled: ${reason}` : "Order cancelled.",
    actor
  );
}

async function getOrder(admin: SupabaseClient, orderId: string): Promise<Order> {
  const { data } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!data) throw new Error("Order not found.");
  return data as Order;
}
