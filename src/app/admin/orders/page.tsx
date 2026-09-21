import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { listOrders } from "@/lib/queries";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import { OrdersTable, type OrderRow } from "@/components/orders-table";

export const metadata = { title: "Orders — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();
  const supabase = await createClient();
  const params = await searchParams;

  // Load all orders; the shared table filters by tab + search so tab counts
  // stay consistent. Relations joined for search (items/customer names).
  const orders = (await listOrders(supabase, {
    limit: 500,
    relations: true,
  })) as unknown as OrderRow[];

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">All orders</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every order ever placed — pending, in fulfilment, delivered, cancelled or refunded.
      </p>
      <div className="mt-5">
        <AdminNav active="orders" />
      </div>

      <div className="mt-6">
        <OrdersTable orders={orders} tab={params.tab} q={params.q} basePath="/admin/orders" />
      </div>
    </div>
  );
}
