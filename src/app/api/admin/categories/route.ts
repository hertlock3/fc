import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { categorySchema, categoryUpdateSchema } from "@/lib/validation";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/catalog";

/**
 * Admin catalog API — categories.
 * Same authorisation model as /api/admin/products.
 */

const idSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/categories — list all categories in display order. */
export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return apiError(error.message, 500);
  return json({ categories: data });
}

/** POST /api/admin/categories — create a category. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const admin = createAdminClient();
  try {
    const category = await createCategory(admin, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      imageUrl: parsed.data.imageUrl || null,
      sortOrder: parsed.data.sortOrder,
    });
    return json({ category }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not create category.", 400);
  }
}

/** PATCH /api/admin/categories — update a category (partial). */
export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = categoryUpdateSchema.extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { id, ...input } = parsed.data;

  const admin = createAdminClient();
  try {
    const category = await updateCategory(admin, id, input);
    return json({ category });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not update category.", 400);
  }
}

/** DELETE /api/admin/categories?id=… — delete a category (only when empty). */
export async function DELETE(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const parsed = idSchema.safeParse({ id: new URL(request.url).searchParams.get("id") ?? "" });
  if (!parsed.success) return apiError("Missing or invalid category id.", 422);

  const admin = createAdminClient();
  try {
    await deleteCategory(admin, parsed.data.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not delete category.", 400);
  }
}
