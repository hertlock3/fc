import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderMessage, SenderRole } from "@/lib/types";

/**
 * Order messaging.
 *
 * `order_messages` has RLS enabled with NO policies — every read/write goes
 * through these helpers, which verify the caller's participation in the
 * thread explicitly and use the service-role client for the actual query.
 */

export interface ChatParticipant {
  profile: { id: string; full_name: string | null; phone: string | null };
  /** How this user participates: staff, the order's customer, or the assigned rider. */
  role: SenderRole;
  /** True for admin/vendor — staff mediate between customer, rider and dispatch. */
  isStaff: boolean;
}

/**
 * Resolve the caller's participation in an order thread.
 * Precedence: staff role > assigned courier > order owner.
 * Returns null when the user has no relationship to the order.
 */
export async function getParticipant(
  admin: SupabaseClient,
  orderId: string,
  userId: string
): Promise<ChatParticipant | null> {
  const [profileRes, orderRes, deliveryRes] = await Promise.all([
    admin.from("profiles").select("id, full_name, phone, role").eq("id", userId).maybeSingle(),
    admin.from("orders").select("id, user_id").eq("id", orderId).maybeSingle(),
    admin
      .from("deliveries")
      .select("id, courier_id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data as
    | { id: string; full_name: string | null; phone: string | null; role: string }
    | null;
  const order = orderRes.data as { id: string; user_id: string } | null;
  const delivery = deliveryRes.data as { id: string; courier_id: string | null } | null;

  if (!profile || !order) return null;

  let role: SenderRole | null = null;
  if (profile.role === "admin" || profile.role === "vendor") {
    role = profile.role as "admin" | "vendor";
  } else if (delivery?.courier_id && delivery.courier_id === userId) {
    role = "courier";
  } else if (order.user_id === userId) {
    role = "customer";
  }

  if (!role) return null;

  return {
    profile: { id: profile.id, full_name: profile.full_name, phone: profile.phone },
    role,
    isStaff: role === "admin" || role === "vendor",
  };
}

/** Fetch the thread (oldest first). Caller must be a verified participant. */
export async function listMessages(
  admin: SupabaseClient,
  orderId: string
): Promise<OrderMessage[]> {
  const { data } = await admin
    .from("order_messages")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return (data ?? []) as OrderMessage[];
}

/** Append a message. Caller must be a verified participant. */
export async function postMessage(
  admin: SupabaseClient,
  input: {
    orderId: string;
    senderId: string;
    senderRole: SenderRole;
    kind: "text" | "photo" | "location";
    body?: string | null;
    imagePath?: string | null;
    lat?: number | null;
    lng?: number | null;
  }
): Promise<OrderMessage> {
  const { data, error } = await admin
    .from("order_messages")
    .insert({
      order_id: input.orderId,
      sender_id: input.senderId,
      sender_role: input.senderRole,
      kind: input.kind,
      body: input.body ?? null,
      image_path: input.imagePath ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as OrderMessage;
}

/** Create a short-lived signed URL for a chat photo (private bucket). */
export async function signedPhotoUrl(
  admin: SupabaseClient,
  path: string
): Promise<string | null> {
  const { data } = await admin.storage.from("chat-photos").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
