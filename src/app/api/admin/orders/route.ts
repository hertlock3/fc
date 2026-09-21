import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderActionSchema } from "@/lib/validation";
import {
  approveOrder,
  assignRider,
  cancelOrder,
  dispatchOrder,
  markDelivered,
  reassignStockist,
} from "@/lib/fulfilment";

/**
 * POST /api/admin/orders
 * Admin/vendor actions on an order: approve, dispatch, assign a rider,
 * mark delivered, or cancel. Authorisation is checked twice — once for the
 * session, once against the profile role.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  if (!(await isAdmin(auth.user.id))) {
    return apiError("You do not have permission to perform this action.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = orderActionSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const { orderId, action, courierName, courierPhone, courierId, stockistId, reason } = parsed.data;
  const admin = createAdminClient();
  const actor = auth.user.email ?? "admin";

  try {
    switch (action) {
      case "approve":
        await approveOrder(admin, orderId, actor, stockistId ?? null);
        break;
      case "dispatch":
        // Riders can be chosen at dispatch time (one-step assignment) or
        // left to the provider, then assigned manually afterwards.
        await dispatchOrder(admin, orderId, actor, {
          profileId: courierId ?? null,
          name: courierName ?? null,
          phone: courierPhone ?? null,
        });
        break;
      case "reassign_stockist":
        if (!stockistId) return apiError("Choose the new stockist.", 422);
        await reassignStockist(admin, orderId, stockistId, actor);
        break;
      case "assign_rider":
        if (!courierName) return apiError("Provide the rider's name.", 422);
        await assignRider(admin, orderId, actor, courierName, courierPhone, courierId ?? null);
        break;
      case "mark_delivered":
        await markDelivered(admin, orderId, actor);
        break;
      case "cancel":
        await cancelOrder(admin, orderId, actor, reason);
        break;
      default:
        return apiError("Unknown action.", 422);
    }
    return json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Action failed.", 400);
  }
}
