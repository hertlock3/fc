"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MapPin, Save } from "lucide-react";
import { Alert, Button, Input, Label, Select, Spinner } from "@/components/ui";
import { NAIROBI_AREAS, findArea } from "@/lib/nairobi-areas";
import type { ReverseGeocodeResult } from "@/components/map-pin-picker";

// Loaded in the browser only — Leaflet touches `window` at import time.
const MapPinPicker = dynamic(
  () => import("@/components/map-pin-picker").then((mod) => mod.MapPinPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
        Loading map…
      </div>
    ),
  }
);

export function AddressForm({
  redirectTo,
  onSaved,
  storeName,
  compact = false,
}: {
  redirectTo?: string;
  onSaved?: () => void;
  storeName: string;
  compact?: boolean;
}) {
  const router = useRouter();

  const defaultArea = findArea("Kahawa West") ?? NAIROBI_AREAS[0];
  const [label, setLabel] = useState("Home");
  const [areaName, setAreaName] = useState(defaultArea.name);
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("Nairobi");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: defaultArea.lat,
    lng: defaultArea.lng,
  });
  const [showMap, setShowMap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Group areas by zone for a friendlier picker.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof NAIROBI_AREAS>();
    for (const area of NAIROBI_AREAS) {
      const list = map.get(area.zone) ?? [];
      list.push(area);
      map.set(area.zone, list);
    }
    return Array.from(map.entries());
  }, []);

  function handleAreaChange(name: string) {
    setAreaName(name);
    const found = findArea(name);
    if (found) setCoords({ lat: found.lat, lng: found.lng });
  }

  /** Fill the address fields from a reverse-geocoded pin. */
  function handleDetectedAddress(result: ReverseGeocodeResult) {
    if (result.line1) setLine1(result.line1.slice(0, 160));
    if (result.city) setCity(result.city.slice(0, 80));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          area: areaName,
          line1,
          city,
          lat: coords.lat,
          lng: coords.lng,
          deliveryNotes: notes,
          isDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the address");

      onSaved?.();
      router.refresh();
      if (redirectTo) router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <Label htmlFor="label">Address label</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Home, Office…"
            required
          />
        </div>

        <div>
          <Label htmlFor="area">Neighbourhood</Label>
          <Select
            id="area"
            value={areaName}
            onChange={(e) => handleAreaChange(e.target.value)}
          >
            {grouped.map(([zone, areas]) => (
              <optgroup key={zone} label={zone}>
                {areas.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="line1">Street / building / house</Label>
        <Input
          id="line1"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          placeholder="e.g. Kileleshwa Gardens, Block B, House 12"
          required
        />
      </div>

      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>
        <div>
          <Label htmlFor="city">Town / city</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="notes">Delivery notes (optional)</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, landmark, call on arrival…"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MapPin className="h-4 w-4 text-brand-600" />
              Pin your exact delivery point
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Drag the pin or tap the map. Using <strong>{areaName}</strong> (
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}). Delivery is
              calculated from {storeName}.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowMap((v) => !v)}
          >
            {showMap ? "Hide map" : "Show map"}
          </Button>
        </div>

        {showMap && (
          <MapPinPicker
            value={coords}
            onChange={setCoords}
            onAddressSelect={handleDetectedAddress}
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Make this my default delivery address
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? (
          <Spinner />
        ) : (
          <>
            <Save className="h-4 w-4" /> Save address
          </>
        )}
      </Button>
    </form>
  );
}
