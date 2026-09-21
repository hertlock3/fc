import { Suspense } from "react";
import Link from "next/link";
import { Bike, Sprout, Store, UserRound } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

/**
 * Registration hub: customers use the inline form; riders and stockists are
 * sent to the dedicated partner signup where their accounts are provisioned
 * with the right role and (for stockists) location row.
 */
export default function RegisterPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <div className="container-page flex flex-col items-center py-14">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white">
            <Sprout className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Join Farmer&apos;s Choice
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Order fresh food — or partner with us to deliver and sell it.
          </p>
        </div>

        {/* Partner entry points */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Link
            href="/register/partner?type=courier"
            className="card flex flex-col items-center gap-1.5 p-4 text-center text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Bike className="h-5 w-5 text-brand-600" />
            Become a rider
            <span className="text-xs font-normal text-slate-500">
              Deliver orders, earn per trip
            </span>
          </Link>
          <Link
            href="/register/partner?type=stockist"
            className="card flex flex-col items-center gap-1.5 p-4 text-center text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Store className="h-5 w-5 text-brand-600" />
            Become a stockist
            <span className="text-xs font-normal text-slate-500">
              Sell &amp; fulfil from your shop
            </span>
          </Link>
        </div>

        <div className="card p-6">
          <p className="mb-4 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
            <UserRound className="h-4 w-4" /> Or create a customer account
          </p>
          <Suspense fallback={<div className="h-80 shimmer rounded-xl" />}>
            <AuthForm mode="register" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
