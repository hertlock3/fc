import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import { UserManager } from "@/components/user-manager";

export const metadata = { title: "Users — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every account on the platform — customers, riders, stockists and staff —
        with role, approval and access controls.
      </p>
      <div className="mt-5">
        <AdminNav active="users" />
      </div>
      <div className="mt-6">
        <UserManager />
      </div>
    </div>
  );
}
