import { Suspense } from "react";
import Link from "next/link";
import { Sprout } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <div className="container-page flex flex-col items-center py-14">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white">
            <Sprout className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to continue shopping and track your orders.
          </p>
        </div>
        <div className="card p-6">
          <Suspense fallback={<div className="h-64 shimmer rounded-xl" />}>
            <AuthForm mode="login" />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          By continuing you agree to our{" "}
          <Link href="/" className="underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
