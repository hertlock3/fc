import { MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser, getProfile } from "@/lib/auth";
import { isSupabaseConfigured, config } from "@/lib/config";
import { NotConfigured } from "@/components/not-configured";
import { AddressForm } from "@/components/address-form";

export const metadata = { title: "Set your delivery location" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireUser("/onboarding");
  const profile = await getProfile();

  // If the profile has no phone yet, they should complete their account first.
  if (profile && !profile.phone) redirect("/account?needPhone=1");

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 mx-auto">
            <MapPin className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Where should we deliver?
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Hi {profile?.full_name?.split(" ")[0] ?? "there"} — add your delivery
            location so we can calculate an accurate delivery fee.
          </p>
        </div>

        <div className="card p-6">
          <AddressForm redirectTo="/shop" storeName={config.store.name} />
        </div>
      </div>
    </div>
  );
}
