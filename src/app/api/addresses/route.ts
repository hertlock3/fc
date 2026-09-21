import { z } from "zod";
import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { addressSchema } from "@/lib/validation";

/** POST /api/addresses — create a delivery address. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const { label, line1, area, city, lat, lng, deliveryNotes, isDefault } = parsed.data;

  // If this is the user's first address, make it the default automatically.
  const { count } = await auth.supabase
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);
  const makeDefault = isDefault || (count ?? 0) === 0;

  if (makeDefault) {
    await auth.supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", auth.user.id);
  }

  const { data, error } = await auth.supabase
    .from("addresses")
    .insert({
      user_id: auth.user.id,
      label: label || "Home",
      line1,
      area: area || null,
      city: city || "Nairobi",
      lat,
      lng,
      delivery_notes: deliveryNotes || null,
      is_default: makeDefault,
    })
    .select("*")
    .single();

  if (error) return apiError(error.message, 500);
  return json({ address: data });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  makeDefault: z.literal(true).optional(),
});

/** PATCH /api/addresses — set an address as the default. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  await auth.supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", auth.user.id);
  const { error } = await auth.supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", parsed.data.id)
    .eq("user_id", auth.user.id);

  if (error) return apiError(error.message, 500);
  return json({ ok: true });
}

/** DELETE /api/addresses?id=... */
export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("Missing address id.", 422);

  const { error } = await auth.supabase
    .from("addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) return apiError(error.message, 500);
  return json({ ok: true });
}
