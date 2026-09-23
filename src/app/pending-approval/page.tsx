import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bike,
  Clock,
  Mail,
  ShieldCheck,
  Store,
  Timer,
} from "lucide-react";
import { getSessionUser, getAccessProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { LogoutButton } from "@/components/logout-button";
import { Badge, buttonClass, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Pending approval — Farmer's Choice" };
export const dynamic = "force-dynamic";

/**
 * Holding screen for partners (riders & stockists) whose accounts are still
 * awaiting admin approval. Every other page redirects here while the account
 * is pending; once an admin approves, the normal dashboards unlock.
 */
export default async function PendingApprovalPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Store setup incomplete" />
      </div>
    );
  }

  const user = await getSessionUser();
  if (!user) {
    // Not signed in — nothing to hold; send them to login.
    return (
      <div className="container-page flex flex-col items-center py-20">
        <EmptyState
          title="You are signed out"
          description="Sign in to check your account status."
          action={
            <Link href="/login" className={buttonClass("primary")}>
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const access = await getAccessProfile();
  if (!access || access.approvalStatus === "approved") {
    // Approved (or profile missing) — leave immediately.
    redirect("/shop");
  }

  const isStockist = access.role === "stockist";
  const isRider = access.role === "courier";
  const name = user.user_metadata?.full_name ?? user.email ?? "there";

  return (
    <div className="relative min-h-[80vh] overflow-hidden">
      {/* Blurred suggestion of the platform behind the hold screen — content
          is deliberately NOT rendered or fetched, only a soft visual veil. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 select-none blur-md"
      >
        <div className="container-page py-10">
          <div className="h-8 w-56 rounded-full bg-slate-200" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="h-24 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
          </div>
          <div className="mt-6 h-40 rounded-2xl bg-slate-100" />
          <div className="mt-6 h-64 rounded-2xl bg-slate-100" />
        </div>
      </div>

      <div className="relative container-page flex min-h-[80vh] items-center justify-center py-16">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 p-8 text-center shadow-xl backdrop-blur">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-50 text-accent-600">
            {isStockist ? <Store className="h-7 w-7" /> : <Bike className="h-7 w-7" />}
          </span>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            {isStockist
              ? "Your stockist account is pending approval"
              : isRider
                ? "Your rider account is pending approval"
                : "Your account is pending approval"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Hi {name} — your {isStockist ? "stockist" : isRider ? "rider" : "partner"}{" "}
            registration was received, but a Farmer&apos;s Choice administrator has not
            approved it yet. Platform access stays locked until then, so nobody can
            create random rider or stockist accounts.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Badge tone="warning">
              <Timer className="h-3.5 w-3.5" /> Pending authentication
            </Badge>
            {isStockist && (
              <Badge tone="info">
                <Clock className="h-3.5 w-3.5" /> Location verification happens at approval
              </Badge>
            )}
          </div>

          <div className="mt-6 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              An admin reviews every rider &amp; stockist sign-up in the Farmer&apos;s
              Choice dashboard — usually within one business day.
            </p>
            <p className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              Questions? Reach us at{" "}
              <a
                href="mailto:support@farmerschoice.market"
                className="font-medium text-brand-700 hover:underline"
              >
                support@farmerschoice.market
              </a>
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Registered {formatDateTime(user.created_at)} · you can sign out and return
            later — your progress is saved.
          </p>

          <div className="mt-6 flex justify-center gap-2">
            {/* Server component — refresh via navigation instead of an onClick,
                which cannot cross the server/client boundary here. */}
            <Link href="/pending-approval" className={buttonClass("secondary")}>
              Check again
            </Link>
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
