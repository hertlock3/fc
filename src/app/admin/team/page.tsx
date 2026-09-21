import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import { TeamManager } from "@/components/team-manager";

export const metadata = { title: "Team — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Courier and Farmer&apos;s Choice staff accounts. Promote an existing customer
        account by email — couriers get the trips portal at /courier.
      </p>
      <div className="mt-5">
        <AdminNav active="dashboard" />
      </div>
      <div className="mt-6">
        <TeamManager />
      </div>
    </div>
  );
}
