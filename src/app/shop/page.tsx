import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { listCategories, listProducts } from "@/lib/queries";
import { NotConfigured } from "@/components/not-configured";
import { ProductCard } from "@/components/product-card";
import { EmptyState, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const { category, q } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();

  const [products, categories] = await Promise.all([
    listProducts(supabase, { categorySlug: category ?? null, search: q ?? null }),
    listCategories(supabase),
  ]);

  const isAuthed = Boolean(user);

  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Farmer&apos;s Choice shop
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {products.length} product{products.length === 1 ? "" : "s"} available for
            delivery.
          </p>
        </div>

        <form className="relative w-full sm:w-72" role="search">
          {category && <input type="hidden" name="category" value={category} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search products…"
            className="pl-9"
            aria-label="Search products"
          />
        </form>
      </div>

      {/* Category chips */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
        <CategoryChip href={buildHref({ q })} active={!category}>
          All
        </CategoryChip>
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            href={buildHref({ q, category: c.slug })}
            active={category === c.slug}
          >
            {c.name}
          </CategoryChip>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-8">
        {products.length === 0 ? (
          <EmptyState
            title="No products found"
            description="Try a different search or category."
            action={
              <Link href="/shop" className="text-sm font-medium text-brand-700 hover:underline">
                Clear filters
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} isAuthed={isAuthed} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildHref(params: { q?: string; category?: string }) {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  return query ? `/shop?${query}` : "/shop";
}

function CategoryChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
      )}
    >
      {children}
    </Link>
  );
}
