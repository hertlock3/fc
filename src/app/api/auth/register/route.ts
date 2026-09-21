import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";
import { partnerRegisterSchema } from "@/lib/validation";
import { json, apiError, zodMessage } from "@/lib/api";
import { normalizeKenyanPhone } from "@/lib/utils";

/**
 * POST /api/auth/register — role-aware signup for customers, riders and
 * stockists.
 *
 * Runs on the server so role assignment is authoritative:
 *   - customers keep the client-side supabase.auth.signUp() flow;
 *   - riders register here and are immediately operational;
 *   - stockists register here too, but their location row starts INACTIVE —
 *     an admin verifies it in /admin/stockists before it takes orders.
 *
 * Rate limiting: a light in-memory guard keeps one endpoint from being
 * hammered into creating accounts.
 */
let lastRegistration: Record<string, number> = {};
const MIN_MS_BETWEEN_SIGNUPS = 5_000;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return apiError("The store is not connected to a database yet.", 503);
  }

  const body = await request.json().catch(() => null);
  const parsed = partnerRegisterSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { role, fullName, email, phone, password, businessName, businessAddress, businessCity } =
    parsed.data;

  // Cheap per-IP throttle (best-effort; the DB is the real authority).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  if (now - (lastRegistration[ip] ?? 0) < MIN_MS_BETWEEN_SIGNUPS) {
    return apiError("Too many sign-up attempts. Please wait a moment.", 429);
  }
  lastRegistration[ip] = now;
  // Keep the throttle map from growing unboundedly.
  if (Object.keys(lastRegistration).length > 500) {
    lastRegistration = {};
  }

  const admin = createAdminClient();

  // Email already registered?
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = (users?.users ?? []).find(
    (u) => u.email?.toLowerCase() === email
  );
  if (existing) {
    return apiError("An account with this email already exists.", 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // partners are verified by staff, not by email loop
    user_metadata: { full_name: fullName, phone },
  });
  if (createError || !created.user) {
    return apiError(createError?.message ?? "Could not create the account.", 400);
  }
  const userId = created.user.id;

  const normalizedPhone = normalizeKenyanPhone(phone) ?? phone;

  try {
    // Profile row (handle_new_user trigger also fires; upsert for safety).
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      phone: normalizedPhone,
      role,
    });
    if (profileError) throw new Error(profileError.message);

    // Stockists: create their location row, inactive until admin-verified.
    if (role === "stockist") {
      if (!businessName || !businessAddress) {
        throw new Error(
          "Stockist registration requires a business name and address."
        );
      }
      // Seed coordinates ≈ Nairobi CBD; the admin corrects them at approval.
      const { error: stockistError } = await admin.from("stockists").insert({
        name: businessName,
        address: businessAddress,
        city: businessCity || "Nairobi",
        phone: normalizedPhone,
        lat: -1.2864,
        lng: 36.8172,
        is_active: false, // pending admin verification
        is_principal: false,
        profile_id: userId,
        notes: `Registered via partner signup by ${fullName}. Activate after verifying location.`,
      });
      if (stockistError) throw new Error(stockistError.message);
    }

    return json({ ok: true, role }, { status: 201 });
  } catch (err) {
    // Roll back the auth user if the profile/location rows failed, so a
    // half-created partner account never lingers.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return apiError(
      err instanceof Error ? err.message : "Registration failed.",
      400
    );
  }
}
