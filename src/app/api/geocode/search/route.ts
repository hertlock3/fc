import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimSearchResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    county?: string;
  };
}

/**
 * GET /api/geocode/search?q=..
 *
 * Forward-geocodes a free-text place into coordinates for the map pin picker,
 * biased to Kenya. Proxied server-side so we can send a compliant User-Agent.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }
  if (q.length > 120) {
    return NextResponse.json({ error: "Search term is too long." }, { status: 422 });
  }

  const limit = rateLimit(clientKey(request, "geocode:search"), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many searches. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  // Bias results to Kenya — this store only delivers within the country.
  url.searchParams.set("countrycodes", "ke");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": config.geocode.userAgent,
        "Accept-Language": "en",
        Accept: "application/json",
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);

    const data = (await res.json()) as NominatimSearchResult[];
    const results = (Array.isArray(data) ? data : [])
      .map((r) => ({
        displayName: r.display_name ?? "",
        lat: Number(r.lat),
        lng: Number(r.lon),
        area: r.address?.suburb ?? r.address?.neighbourhood ?? null,
        city: r.address?.city ?? r.address?.town ?? r.address?.county ?? null,
      }))
      .filter((r) => r.displayName && Number.isFinite(r.lat) && Number.isFinite(r.lng));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Place search failed." },
      { status: 502 }
    );
  }
}
