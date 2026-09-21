import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";

/**
 * Admin catalog operations.
 *
 * Every function expects a **service-role** client (RLS-bypassing) and must
 * only be called after an explicit admin/vendor authorisation check — see
 * `requireApiAdmin()` in `@/lib/api`.
 */

/* ------------------------------------------------------------------ slugs -- */

/**
 * Derive a unique slug for a table from a base string, e.g.
 * "streaky-bacon", "streaky-bacon-2", … Optionally exclude the row being
 * updated so renaming a product keeps its own slug available.
 */
export async function uniqueSlug(
  admin: SupabaseClient,
  table: "products" | "categories",
  base: string,
  excludeId?: string
): Promise<string> {
  const root = slugify(base) || "item";
  const { data } = await admin.from(table).select("id, slug").ilike("slug", `${root}%`);
  const taken = new Set(
    ((data ?? []) as Array<{ id: string; slug: string }>)
      .filter((row) => row.id !== excludeId)
      .map((row) => row.slug)
  );
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* --------------------------------------------------------------- products -- */

export interface ProductInput {
  name: string;
  categoryId?: string | null;
  description?: string | null;
  /** Price in whole shillings; stored as integer cents. */
  price: number;
  unit?: string;
  sku?: string | null;
  imageUrl?: string | null;
  inStock?: boolean;
  stockQty?: number;
  isActive?: boolean;
}

export async function createProduct(
  admin: SupabaseClient,
  input: ProductInput
): Promise<Product> {
  const slug = await uniqueSlug(admin, "products", input.name);
  const { data, error } = await admin
    .from("products")
    .insert({
      name: input.name,
      slug,
      category_id: input.categoryId ?? null,
      description: input.description || null,
      price_cents: Math.round(input.price * 100),
      unit: input.unit || "each",
      sku: input.sku || null,
      image_url: input.imageUrl || null,
      in_stock: input.inStock ?? true,
      stock_qty: input.stockQty ?? 0,
      is_active: input.isActive ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Product;
}

export async function updateProduct(
  admin: SupabaseClient,
  productId: string,
  input: Partial<ProductInput>
): Promise<Product> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    patch.name = input.name;
    patch.slug = await uniqueSlug(admin, "products", input.name, productId);
  }
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.price !== undefined) patch.price_cents = Math.round(input.price * 100);
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.sku !== undefined) patch.sku = input.sku || null;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl || null;
  if (input.inStock !== undefined) patch.in_stock = input.inStock;
  if (input.stockQty !== undefined) patch.stock_qty = input.stockQty;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (Object.keys(patch).length === 0) {
    const { data } = await admin.from("products").select("*").eq("id", productId).maybeSingle();
    if (!data) throw new Error("Product not found.");
    return data as Product;
  }

  const { data, error } = await admin
    .from("products")
    .update(patch)
    .eq("id", productId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Product;
}

/**
 * Permanently delete a product. NOTE: rows in open carts referencing the
 * product are removed (FK cascade) and past order line items keep their
 * snapshot but lose the product link (FK set null). Prefer archiving
 * (`isActive: false`) for products with sales history.
 */
export async function deleteProduct(admin: SupabaseClient, productId: string): Promise<void> {
  const { error } = await admin.from("products").delete().eq("id", productId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------- categories -- */

export interface CategoryInput {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
}

export async function createCategory(
  admin: SupabaseClient,
  input: CategoryInput
): Promise<Category> {
  const slug = await uniqueSlug(admin, "categories", input.name);
  const { data, error } = await admin
    .from("categories")
    .insert({
      name: input.name,
      slug,
      description: input.description || null,
      image_url: input.imageUrl || null,
      sort_order: input.sortOrder ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Category;
}

export async function updateCategory(
  admin: SupabaseClient,
  categoryId: string,
  input: Partial<CategoryInput>
): Promise<Category> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    patch.name = input.name;
    patch.slug = await uniqueSlug(admin, "categories", input.name, categoryId);
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl || null;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  if (Object.keys(patch).length === 0) {
    const { data } = await admin.from("categories").select("*").eq("id", categoryId).maybeSingle();
    if (!data) throw new Error("Category not found.");
    return data as Category;
  }

  const { data, error } = await admin
    .from("categories")
    .update(patch)
    .eq("id", categoryId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Category;
}

/** Delete a category. Products keep existing (their category_id becomes null). */
export async function deleteCategory(admin: SupabaseClient, categoryId: string): Promise<void> {
  const { count, error: countError } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error(
      `This category still has ${count} product(s). Move or delete them first.`
    );
  }
  const { error } = await admin.from("categories").delete().eq("id", categoryId);
  if (error) throw new Error(error.message);
}
