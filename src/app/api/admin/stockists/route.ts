import { z } from "zod";
import {
  requireApiAdmin,
  json,
  apiError,
  zodMessage,
} from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { haversineKm } from "@/lib/pricing";

/* ------------------------------------------------------------------ schema -- */

const name = z.string().trim().min(2, "Give the stockist a name").max(120);
const address = z.string().trim().min(4, "Enter the street address").max(240);
const city = z.string().trim().min(2, "Enter the town or city").max(80);
const phone = z.string().trim().max(20);
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const openingHours = z.string().trim().max(120);
const notes = z.string().trim().max(300);
const flags = { isActive: z.coerce.boolean(), isPrincipal: z.coerce.boolean() };

export const stockistSchema = z.object({
  name,
  address,
  city: city.default("Nairobi"),
  phone: phone.optional(),
  lat,
  lng,
  openingHours: openingHours.optional(),
  notes: notes.optional(),
  isActive: flags.isActive.default(true),
  isPrincipal: flags.isPrincipal.default(false),
});

/** Partial update — absent fields are left unchanged. */
export const stockistUpdateSchema = z.object({
  id: z.string().uuid(),
  name: name.optional(),
  address: address.optional(),
  city: city.optional(),
  phone: phone.optional(),
  lat: lat.optional(),
  lng: lng.optional(),
  openingHours: openingHours.optional(),
  notes: notes.optional(),
  isActive: flags.isActive.optional(),
  isPrincipal: flags.isPrincipal.optional(),
});

type StockistRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  lat: number;
  lng: number;
  opening_hours: string | null;
  notes: string | null;
  is_active: boolean;
  is_principal: boolean;
  created_at: string;
  updated_at: string;
};

/** Guard: at most one principal plant must exist. */
async function ensureSinglePrincipal(
  admin: ReturnType<typeof createAdminClient>,
  editingId: string | null,
  makePrincipal: boolean
): Promise<string | null> {
  if (!makePrincipal) return null;
  const { data } = await admin
    .from("stockists")
    .select("id, name")
    .eq("is_principal", true);
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  const other = rows.find((r) => r.id !== editingId);
  if (other) {
    return `“${other.name}” is already the principal plant. Untick “principal” there first.`;
  }
  return null;
}

/** GET /api/admin/stockists — list all stockists with distance from config.store. */
export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stockists")
    .select("*")
    .order("is_principal", { ascending: false })
    .order("name", { ascending: true });
  if (error) return apiError(error.message, 500);

  const origin = { lat: config.store.lat, lng: config.store.lng };
  const stockists = ((data ?? []) as StockistRow[]).map((s) => ({
    ...s,
    distance_km: haversineKm(origin, { lat: s.lat, lng: s.lng }),
  }));

  return json({ stockists });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = stockistSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const admin = createAdminClient();
  const principalError = await ensureSinglePrincipal(
    admin,
    null,
    parsed.data.isPrincipal
  );
  if (principalError) return apiError(principalError, 409);

  const { data, error } = await admin
    .from("stockists")
    .insert({
      name: parsed.data.name,
      address: parsed.data.address,
      city: parsed.data.city,
      phone: parsed.data.phone || null,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      opening_hours: parsed.data.openingHours || null,
      notes: parsed.data.notes || null,
      is_active: parsed.data.isActive,
      is_principal: parsed.data.isPrincipal,
    })
    .select("*")
    .single();
  if (error) return apiError(error.message, 500);

  return json({ stockist: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = stockistUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { id, ...updates } = parsed.data;

  const admin = createAdminClient();
  if (updates.isPrincipal) {
    const principalError = await ensureSinglePrincipal(admin, id, true);
    if (principalError) return apiError(principalError, 409);
  }

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.address !== undefined) patch.address = updates.address;
  if (updates.city !== undefined) patch.city = updates.city;
  if (updates.phone !== undefined) patch.phone = updates.phone || null;
  if (updates.lat !== undefined) patch.lat = updates.lat;
  if (updates.lng !== undefined) patch.lng = updates.lng;
  if (updates.openingHours !== undefined)
    patch.opening_hours = updates.openingHours || null;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  if (updates.isPrincipal !== undefined) patch.is_principal = updates.isPrincipal;

  if (Object.keys(patch).length === 0) {
    return apiError("Nothing to update.", 422);
  }

  const { data, error } = await admin
    .from("stockists")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return apiError(error.message, 500);

  return json({ stockist: data });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("Missing stockist id.", 422);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("stockists")
    .select("id, name, is_principal")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return apiError("Stockist not found.", 404);
  if ((existing as { is_principal: boolean }).is_principal) {
    return apiError(
      "The principal plant cannot be deleted — deactivate it instead.",
      409
    );
  }

  // Past orders keep working: orders.stockist_id is ON DELETE SET NULL and
  // dispatch falls back to the principal plant when a stockist is missing.
  const { error } = await admin.from("stockists").delete().eq("id", id);
  if (error) return apiError(error.message, 500);

  return json({ ok: true });
}
