"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { Button, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  displayName: string | null;
  line1: string | null;
  area: string | null;
  city: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
}

interface PlaceResult extends GeoPoint {
  displayName: string;
  area: string | null;
  city: string | null;
}

/** A branded map pin (SVG divIcon avoids Leaflet's broken default marker URLs). */
const PIN_ICON = L.divIcon({
  className: "fc-map-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" fill="none">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 13.2 23.4 13.76 23.94a1.75 1.75 0 0 0 2.48 0C16.8 38.4 30 25.5 30 15 30 6.716 23.284 0 15 0Z" fill="#15803d"/>
    <circle cx="15" cy="15" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
});

/** Reports map clicks so the pin can be placed anywhere. */
function ClickToPlace({ onPick }: { onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/** Keeps the map centred when the pin moves from outside (e.g. search/location). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const center = map.getCenter();
    // Skip redundant recenters (avoids animation jitter on tiny changes).
    if (
      center.lat.toFixed(5) === lat.toFixed(5) &&
      center.lng.toFixed(5) === lng.toFixed(5)
    ) {
      return;
    }
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

export function MapPinPicker({
  value,
  onChange,
  onAddressSelect,
  className,
}: {
  value: GeoPoint;
  onChange: (point: GeoPoint) => void;
  /** Called with the resolved address when the customer taps "Use address at pin". */
  onAddressSelect?: (result: ReverseGeocodeResult) => void;
  className?: string;
}) {
  // `center` is only read once — later moves are handled by <Recenter />.
  const [initialCenter] = useState<[number, number]>(() => [value.lat, value.lng]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(point: GeoPoint) {
    setMessage(null);
    setError(null);
    setResults([]);
    onChange(point);
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setError("Type at least 3 characters to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      const found = (data.results ?? []) as PlaceResult[];
      setResults(found);
      if (found.length === 0) setError("No matching places found. Try a nearby landmark.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    setError(null);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        pick({ lat: position.coords.latitude, lng: position.coords.longitude });
        setMessage("Centred on your current location. Fine-tune the pin if needed.");
      },
      () => {
        setLocating(false);
        setError("Could not get your location. Check your browser permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function useAddressAtPin() {
    setResolving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/geocode/reverse?lat=${value.lat}&lng=${value.lng}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Address lookup failed.");
      const result = data.result as ReverseGeocodeResult;
      if (result.displayName) setMessage(`Pinned at ${result.displayName}`);
      onAddressSelect?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Address lookup failed.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an estate, road or landmark…"
          aria-label="Search for a place"
        />
        <Button type="submit" variant="secondary" disabled={searching} aria-label="Search">
          {searching ? <Spinner /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {results.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-1">
          {results.map((result, index) => (
            <li key={`${result.lat}-${result.lng}-${index}`}>
              <button
                type="button"
                onClick={() => {
                  pick({ lat: result.lat, lng: result.lng });
                  setQuery(result.displayName);
                  setMessage(`Centred on ${result.displayName}`);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-brand-50 hover:text-brand-800"
              >
                {result.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative isolate h-64 w-full overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={initialCenter}
          zoom={13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickToPlace onPick={pick} />
          <Recenter lat={value.lat} lng={value.lng} />
          <Marker
            position={[value.lat, value.lng]}
            icon={PIN_ICON}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const point = marker.getLatLng();
                pick({ lat: point.lat, lng: point.lng });
              },
            }}
          />
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? <Spinner /> : <LocateFixed className="h-4 w-4" />}
          Use my location
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={useAddressAtPin}
          disabled={resolving}
        >
          {resolving ? <Spinner /> : <MapPin className="h-4 w-4" />}
          Use address at pin
        </Button>
        <span className="ml-auto font-mono text-xs text-slate-500">
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </span>
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
