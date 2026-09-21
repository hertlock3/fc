import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import { FinanceDashboard } from "@/components/finance-dashboard";

export const metadata = { title: "Finance — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminFinancePage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Finance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Where the money goes — goods, delivery and the platform service charge — plus
        control of the M-Pesa receiving account.
      </p>
      <div className="mt-5">
        <AdminNav active="dashboard" />
      </div>
      <div className="mt-6">
        <FinanceDashboard />
      </div>
    </div>
  );
}
