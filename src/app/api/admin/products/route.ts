import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { productSchema, productUpdateSchema } from "@/lib/validation";
import {
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/catalog";

/**
 * Admin catalog API — products.
 *
 * Every handler verifies the caller is a signed-in admin/vendor first
 * (401/403 otherwise) and then performs the write with the service-role
 * client. RLS is the second line of defence.
 */

const idSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/products — list ALL products (including inactive/archived). */
export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });
  if (error) return apiError(error.message, 500);
  return json({ products: data });
}

/** POST /api/admin/products — create a product. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const admin = createAdminClient();
  try {
    const product = await createProduct(admin, {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      description: parsed.data.description || null,
      price: parsed.data.price,
      unit: parsed.data.unit,
      sku: parsed.data.sku || null,
      imageUrl: parsed.data.imageUrl || null,
      inStock: parsed.data.inStock,
      stockQty: parsed.data.stockQty,
      isActive: parsed.data.isActive,
    });
    return json({ product }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not create product.", 400);
  }
}

/** PATCH /api/admin/products — update a product (partial). */
export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productUpdateSchema.extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { id, ...input } = parsed.data;

  const admin = createAdminClient();
  try {
    const product = await updateProduct(admin, id, input);
    return json({ product });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not update product.", 400);
  }
}

/** DELETE /api/admin/products?id=… — permanently delete a product. */
export async function DELETE(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const parsed = idSchema.safeParse({ id: new URL(request.url).searchParams.get("id") ?? "" });
  if (!parsed.success) return apiError("Missing or invalid product id.", 422);

  const admin = createAdminClient();
  try {
    await deleteProduct(admin, parsed.data.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not delete product.", 400);
  }
}
