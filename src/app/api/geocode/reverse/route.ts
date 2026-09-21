import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
}

interface NominatimReverseResponse {
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

/**
 * GET /api/geocode/reverse?lat=..&lng=..
 *
 * Reverse-geocodes a pin into a human-readable address using OpenStreetMap's
 * Nominatim. Proxied through the server so we can send a compliant
 * User-Agent (required by the Nominatim usage policy) and keep the browser
 * free of rate-limit surprises.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 422 });
  }

  const limit = rateLimit(clientKey(request, "geocode:reverse"), 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many lookups. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const url = new URL(`${NOMINATIM}/reverse`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toFixed(6));
  url.searchParams.set("lon", lng.toFixed(6));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": config.geocode.userAgent,
        "Accept-Language": "en",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);

    const data = (await res.json()) as NominatimReverseResponse;
    if (data.error) throw new Error(data.error);

    const a = data.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ").trim();

    return NextResponse.json({
      result: {
        displayName: data.display_name ?? null,
        line1: street || a.neighbourhood || a.suburb || null,
        area: a.suburb ?? a.neighbourhood ?? a.city_district ?? null,
        city: a.city ?? a.town ?? a.village ?? a.county ?? null,
        postcode: a.postcode ?? null,
        lat,
        lng,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Address lookup failed." },
      { status: 502 }
    );
  }
}
