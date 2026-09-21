import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured, config } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { listStockistsWithDistance } from "@/lib/stockists";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import { StockistManager } from "@/components/stockist-manager";

export const metadata = { title: "Stockists — Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin stockists — manage the fulfilment locations orders are routed to:
 * the principal butchery plant (Ruiru) and every Farmer's Choice stockist.
 */
export default async function AdminStockistsPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();

  const stockists = await listStockistsWithDistance(createAdminClient(), {
    lat: config.store.lat,
    lng: config.store.lng,
  });

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Stockists
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Farmer&apos;s Choice fulfilment locations. Checkout routes each order to
        the stockist nearest the customer&apos;s address; the principal plant is
        the fallback.
      </p>
      <div className="mt-5">
        <AdminNav active="stockists" />
      </div>
      <div className="mt-6">
        <StockistManager
          stockists={stockists}
          storeOrigin={config.store.name}
        />
      </div>
    </div>
  );
}
