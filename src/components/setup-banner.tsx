import { Database } from "lucide-react";
import { isSupabaseConfigured, config } from "@/lib/config";

/**
 * Friendly, non-blocking notice shown while the app has no database attached.
 * Keeps the storefront readable instead of throwing on missing env vars.
 */
export function SetupBanner() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="border-b border-accent-200 bg-accent-50">
      <div className="container-page flex flex-wrap items-center gap-3 py-2.5 text-sm text-accent-900">
        <Database className="h-4 w-4 shrink-0" />
        <span className="font-medium">Setup required:</span>
        <span className="text-accent-800">
          Add your Supabase keys to <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">.env.local</code>{" "}
          and run the schema in <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">supabase/migrations</code>.
          Money provider: <strong>{config.money.provider}</strong> · Delivery:{" "}
          <strong>{config.delivery.provider}</strong>.
        </span>
      </div>
    </div>
  );
}
