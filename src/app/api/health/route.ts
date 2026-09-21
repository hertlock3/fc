import { json } from "@/lib/api";
import { config, isSupabaseConfigured, hasServiceRole } from "@/lib/config";

/** GET /api/health — deployment/config readiness probe (no secrets exposed). */
export async function GET() {
  return json({
    ok: true,
    app: config.appName,
    supabaseConfigured: isSupabaseConfigured(),
    serviceRoleConfigured: hasServiceRole(),
    moneyProvider: config.money.provider,
    deliveryProvider: config.delivery.provider,
    distanceProvider: config.distance.provider,
    serviceFeePercent: config.serviceFee.percent,
  });
}
