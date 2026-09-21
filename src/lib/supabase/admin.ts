import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * Privileged Supabase client using the **service role** key.
 *
 * ⚠️ Server-only. Never import this into a Client Component and never expose
 * the key to the browser. It bypasses Row Level Security and is used for:
 *   - writing order/payment/invoice rows during checkout
 *   - processing M-Pesa callbacks
 *   - admin (Farmer's Choice) approvals and delivery dispatch
 *
 * Every use MUST be guarded by an explicit authorisation check first.
 */
export function createAdminClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error(
      "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local"
    );
  }

  return createSupabaseClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
