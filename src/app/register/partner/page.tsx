import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Bike, Sprout, Store } from "lucide-react";
import { PartnerRegisterForm } from "@/components/partner-register-form";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata = { title: "Partner registration" };
export const dynamic = "force-dynamic";

/**
 * Rider & stockist signup. The `type` query param pre-selects the role but
 * the user can still switch on the form.
 */
export default async function PartnerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const { type } = await searchParams;

  return (
    <div className="container-page flex flex-col items-center py-14">
      <div className="w-full max-w-md">
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to registration
        </Link>
        <div className="mb-6 mt-4 flex flex-col items-center text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white">
            {type === "stockist" ? <Store className="h-6 w-6" /> : <Bike className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Partner with Farmer&apos;s Choice
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {type === "stockist"
              ? "Sell Farmer's Choice products from your shop. We verify your location before you go live."
              : "Deliver orders across Nairobi and earn per trip."}
          </p>
        </div>
        <div className="card p-6">
          <Suspense fallback={<div className="h-96 shimmer rounded-xl" />}>
            <PartnerRegisterForm />
          </Suspense>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
          <Sprout className="h-3.5 w-3.5" />
          Stockist locations are reviewed by Farmer&apos;s Choice before activation.
        </p>
      </div>
    </div>
  );
}
