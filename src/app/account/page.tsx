import { requireUser, getProfile } from "@/lib/auth";
import { isSupabaseConfigured, config } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { NotConfigured } from "@/components/not-configured";
import { AccountClient } from "@/components/account-client";
import { LogoutButton } from "@/components/logout-button";
import type { Address } from "@/lib/types";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const user = await requireUser("/account");
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false });

  const addresses = (data ?? []) as Address[];

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your details and delivery addresses.
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="mt-8">
        <AccountClient
          userId={user.id}
          email={user.email ?? ""}
          profile={profile}
          addresses={addresses}
          storeName={config.store.name}
        />
      </div>
    </div>
  );
}
