import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { listOrders } from "@/lib/queries";
import { NotConfigured } from "@/components/not-configured";
import { OrderStatusBadge } from "@/components/status-badge";
import { OrdersTable, type OrderRow } from "@/components/orders-table";
import { EmptyState, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Your orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const user = await requireUser("/orders");
  const supabase = await createClient();
  const params = await searchParams;
  const admin = await isAdmin(user.id);

  /* ------------------------------------------------------------ admin view */
  if (admin) {
    const orders = (await listOrders(supabase, {
      limit: 500,
      relations: true,
    })) as unknown as OrderRow[];

    return (
      <div className="container-page py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">All orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          You are viewing every order in the store (admin view).{" "}
          <Link href="/admin/orders" className="text-brand-700 hover:underline">
            Open the admin dashboard →
          </Link>
        </p>

        <div className="mt-6">
          <OrdersTable orders={orders} tab={params.tab} q={params.q} basePath="/orders" />
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------- customer view */
  const orders = await listOrders(supabase, { userId: user.id });

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your orders</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track deliveries and download your invoices.
      </p>

      <div className="mt-8">
        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="When you place an order it will appear here with live tracking."
            action={
              <Link href="/shop" className={buttonClass("primary", "md")}>
                Start shopping
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id} className="card p-4 transition hover:shadow-md sm:p-5">
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Receipt className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{order.order_number}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(order.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <OrderStatusBadge status={order.status} />
                    <span className="font-semibold text-slate-900">
                      {formatMoney(order.total_cents)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
