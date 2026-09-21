import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReference } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";

/**
 * Allowed order-status transitions. Enforced server-side so an order can never
 * jump to an impossible state (e.g. delivered before payment).
 */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["awaiting_vendor_approval", "cancelled", "refunded"],
  awaiting_vendor_approval: ["vendor_approved", "cancelled", "refunded"],
  vendor_approved: ["dispatching", "cancelled", "refunded"],
  dispatching: ["out_for_delivery", "cancelled", "refunded"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_FLOW[from]?.includes(to) ?? false;
}

/** Human-friendly labels for each status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Payment received",
  awaiting_vendor_approval: "Awaiting Farmer's Choice approval",
  vendor_approved: "Approved by Farmer's Choice",
  dispatching: "Finding a rider",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  pending_payment: "warning",
  paid: "info",
  awaiting_vendor_approval: "info",
  vendor_approved: "info",
  dispatching: "info",
  out_for_delivery: "info",
  delivered: "success",
  cancelled: "danger",
  refunded: "neutral",
};

/** e.g. FC-20260920-7K2M */
export function generateOrderNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return `FC-${date}-${generateReference("", 4)}`;
}

/** e.g. INV-CUS-202609-00042 or INV-VEN-202609-00042 */
export function generateInvoiceNumber(kind: "customer" | "vendor"): string {
  const now = new Date();
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const suffix = generateReference("", 5);
  return `INV-${kind === "customer" ? "CUS" : "VEN"}-${period}-${suffix}`;
}

/** Append an entry to the immutable order timeline. */
export async function logOrderEvent(
  admin: SupabaseClient,
  orderId: string,
  eventType: string,
  message: string,
  actor: string,
  meta: Record<string, unknown> | null = null
): Promise<void> {
  await admin.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    message,
    actor,
    meta,
  });
}

