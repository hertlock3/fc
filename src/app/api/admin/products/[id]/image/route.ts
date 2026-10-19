import { requireApiUser, json, apiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";

/**
 * Admin product image API — Supabase Storage-backed.
 *
 * POST   /api/admin/products/:id/image  (multipart/form-data, field "file")
 *   Uploads a product photo to the public `product-images` bucket, deletes the
 *   previous photo (if any) and sets products.image_url to the new public URL.
 *
 * DELETE /api/admin/products/:id/image
 *   Removes the photo from storage and clears products.image_url.
 *
 * Every handler verifies the caller is a signed-in admin/vendor first.
 */

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matching order-chat photo uploads
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** Extract the object path from a public URL in this bucket, or null. */
function pathFromUrl(url: string): string | null {
  const marker = "/object/public/product-images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0] || null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!(await isAdmin(auth.user.id))) {
    return apiError("You do not have permission to perform this action.", 403);
  }

  const { id } = await params;

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!product) return apiError("Product not found.", 404);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("Attach an image file.", 422);
  if (file.size > MAX_BYTES) return apiError("Image must be 5 MB or smaller.", 422);
  if (!ALLOWED.has(file.type)) {
    return apiError("Only JPG, PNG, WebP or AVIF images are allowed.", 422);
  }

  const ext =
    (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  // Unique path per upload: re-uploads never serve a stale browser-cached file.
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });
  if (uploadError) return apiError(`Upload failed: ${uploadError.message}`, 500);

  const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = publicData?.publicUrl ?? null;
  if (!imageUrl) {
    // Roll the upload back so we don't leave an orphaned object behind.
    await admin.storage.from(BUCKET).remove([path]);
    return apiError("Could not resolve a public URL for the upload.", 500);
  }

  const { data: updated, error: updateError } = await admin
    .from("products")
    .update({ image_url: imageUrl })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    await admin.storage.from(BUCKET).remove([path]);
    return apiError(updateError.message, 500);
  }

  // Best-effort cleanup of the previous photo.
  const oldPath = product.image_url ? pathFromUrl(product.image_url) : null;
  if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]).catch(() => {});

  return json({ product: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!(await isAdmin(auth.user.id))) {
    return apiError("You do not have permission to perform this action.", 403);
  }

  const { id } = await params;

  const admin = createAdminClient();
  const { data: product } = await admin
    .from("products")
    .select("id, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!product) return apiError("Product not found.", 404);

  const { data: updated, error: updateError } = await admin
    .from("products")
    .update({ image_url: null })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return apiError(updateError.message, 500);

  const oldPath = product.image_url ? pathFromUrl(product.image_url) : null;
  if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]).catch(() => {});

  return json({ product: updated });
}
