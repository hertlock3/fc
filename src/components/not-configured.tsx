import { Database, ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Rendered by data-dependent pages when Supabase has not been configured. */
export function NotConfigured({
  title = "Connect your database to continue",
  description = "This screen needs Supabase. Add your project keys to .env.local, apply supabase/migrations, then reload.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="container-page py-20">
      <div className="mx-auto max-w-lg card p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <Database className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className={buttonClass("secondary", "md")}>
            Back home
          </Link>
          <Link href="/shop" className={buttonClass("primary", "md")}>
            Try the shop <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
