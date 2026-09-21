import { requireApiUser, json, apiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParticipant, listMessages, postMessage, signedPhotoUrl } from "@/lib/messages";

/**
 * Order chat API — customer, assigned rider and FC staff only.
 * Participation is verified server-side on every request; RLS on
 * order_messages has no policies so there is no direct browser access.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const participant = await getParticipant(admin, id, auth.user.id);
  if (!participant) return apiError("You are not part of this order's thread.", 403);

  const messages = await listMessages(admin, id);

  // Photos live in a private bucket — swap in short-lived signed URLs.
  const withUrls = await Promise.all(
    messages.map(async (m) => {
      if (m.kind !== "photo" || !m.image_path) return m;
      return { ...m, image_url: await signedPhotoUrl(admin, m.image_path) };
    })
  );

  return json({ messages: withUrls, me: { id: auth.user.id, role: participant.role } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminClient();
  const participant = await getParticipant(admin, id, auth.user.id);
  if (!participant) return apiError("You are not part of this order's thread.", 403);

  const contentType = request.headers.get("content-type") ?? "";

  /* ------------------------------------------------------------ photo ---- */
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError("Attach an image file.", 422);
    if (file.size > 5 * 1024 * 1024) return apiError("Image must be 5 MB or smaller.", 422);
    if (!file.type.startsWith("image/")) return apiError("Only image files are allowed.", 422);

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;

    const { error: uploadError } = await admin.storage
      .from("chat-photos")
      .upload(path, file, { contentType: file.type });
    if (uploadError) return apiError(`Upload failed: ${uploadError.message}`, 500);

    const message = await postMessage(admin, {
      orderId: id,
      senderId: auth.user.id,
      senderRole: participant.role,
      kind: "photo",
      body: typeof form?.get("caption") === "string" ? String(form.get("caption")) : null,
      imagePath: path,
    });
    const url = await signedPhotoUrl(admin, path);
    return json({ message: { ...message, image_url: url } }, { status: 201 });
  }

  /* -------------------------------------------------- text / location ---- */
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError("Invalid request body.", 422);

  const { kind, text, lat, lng } = body as {
    kind?: string;
    text?: string;
    lat?: unknown;
    lng?: unknown;
  };

  if (kind === "location") {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return apiError("Provide valid coordinates.", 422);
    }
    const message = await postMessage(admin, {
      orderId: id,
      senderId: auth.user.id,
      senderRole: participant.role,
      kind: "location",
      lat: latNum,
      lng: lngNum,
    });
    return json({ message }, { status: 201 });
  }

  const text_ = (text ?? "").trim();
  if (!text_) return apiError("Message cannot be empty.", 422);
  if (text_.length > 2000) return apiError("Message is too long (max 2000 chars).", 422);

  const message = await postMessage(admin, {
    orderId: id,
    senderId: auth.user.id,
    senderRole: participant.role,
    kind: "text",
    body: text_,
  });
  return json({ message }, { status: 201 });
}
