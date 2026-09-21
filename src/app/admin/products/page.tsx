import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/queries";
import { CatalogManager } from "@/components/catalog-manager";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import type { Product } from "@/lib/types";

export const metadata = { title: "Catalog — Admin" };
export const dynamic = "force-dynamic";

/**
 * Catalog manager — admins/vendors can create, edit, archive and delete
 * products and their categories. Writes go through /api/admin/* which enforce
 * the admin role server-side; RLS policies are the second line of defence.
 */
export default async function AdminProductsPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();
  const supabase = await createClient();

  // listProducts filters to is_active; the manager needs everything, so query
  // directly and reuse listCategories for display order.
  const [{ data: products }, categories] = await Promise.all([
    supabase.from("products").select("*").order("name", { ascending: true }),
    listCategories(supabase),
  ]);

  return (
    <div className="container-page py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the products and categories customers see in the shop.
        </p>
      </div>
      <div className="mt-5">
        <AdminNav active="catalog" />
      </div>
      <div className="mt-8">
        <CatalogManager
          products={(products ?? []) as Product[]}
          categories={categories}
        />
      </div>
    </div>
  );
}
