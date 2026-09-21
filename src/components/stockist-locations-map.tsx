"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BadgeCheck,
  Ban,
  ExternalLink,
  MapPin,
  Store,
  UserX,
} from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** One pinned fulfilment location, with its optional partner login. */
export interface StockistMapLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  lat: number;
  lng: number;
  is_active: boolean;
  is_principal: boolean;
  /** profiles.id of the partner login managing this location (if any). */
  profile_id: string | null;
  partner_name: string | null;
  partner_role: string | null;
  partner_approval: string | null;
}

/* Branded pins: gold for the principal plant, brand-green for active
   stockists, grey for inactive ones. SVG divIcons avoid Leaflet's broken
   default marker asset URLs (same approach as live-tracking-map). */
const PRINCIPAL_ICON = L.divIcon({
  className: "fc-principal-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 30 40" fill="none">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 13.2 23.4 13.76 23.94a1.75 1.75 0 0 0 2.48 0C16.8 38.4 30 25.5 30 15 30 6.716 23.284 0 15 0Z" fill="#b45309"/>
    <circle cx="15" cy="15" r="7.5" fill="white"/>
    <path d="M10.5 15h9M12 12.2h6M12 17.8h6" stroke="#b45309" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
  popupAnchor: [0, -40],
});

const ACTIVE_ICON = L.divIcon({
  className: "fc-active-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" fill="none">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 13.2 23.4 13.76 23.94a1.75 1.75 0 0 0 2.48 0C16.8 38.4 30 25.5 30 15 30 6.716 23.284 0 15 0Z" fill="#15803d"/>
    <circle cx="15" cy="15" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
});

const INACTIVE_ICON = L.divIcon({
  className: "fc-inactive-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40" fill="none">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 13.2 23.4 13.76 23.94a1.75 1.75 0 0 0 2.48 0C16.8 38.4 30 25.5 30 15 30 6.716 23.284 0 15 0Z" fill="#94a3b8"/>
    <circle cx="15" cy="15" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
});

/** Centers the map on the selected location and opens its popup. */
function FocusLocation({
  selected,
  locations,
  markers,
}: {
  selected: string | null;
  locations: StockistMapLocation[];
  markers: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selected) return;
    const loc = locations.find((l) => l.id === selected);
    if (!loc) return;
    map.setView([loc.lat, loc.lng], Math.max(map.getZoom(), 13), { animate: true });
    markers.current.get(selected)?.openPopup();
  }, [selected, locations, map, markers]);
  return null;
}

export function StockistLocationsMap({
  locations,
  className,
}: {
  locations: StockistMapLocation[];
  className?: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  // Nairobi-centred fallback; fitBounds handles the real spread.
  const center = useMemo<[number, number]>(() => {
    if (locations.length === 0) return [-1.2864, 36.8172];
    const lat =
      locations.reduce((s, l) => s + l.lat, 0) / locations.length;
    const lng =
      locations.reduce((s, l) => s + l.lng, 0) / locations.length;
    return [lat, lng];
  }, [locations]);

  const points = useMemo(
    () => locations.map((l) => [l.lat, l.lng] as [number, number]),
    [locations]
  );

  const selected = locations.find((l) => l.id === selectedId) ?? null;

  /** Click-through: partner profile on /admin/users, else the stockist manager. */
  function openProfile(loc: StockistMapLocation) {
    if (loc.profile_id) {
      router.push(`/admin/users?user=${loc.profile_id}`);
    } else {
      router.push("/admin/stockists");
    }
  }

  return (
    <div className={cn("grid gap-5 lg:grid-cols-[1fr_360px]", className)}>
      {/* Map */}
      <div className="relative isolate h-[480px] overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <FocusLocation
            selected={selectedId}
            locations={locations}
            markers={markerRefs}
          />
          {locations.map((loc) => (
            <Marker
              key={loc.id}
              position={[loc.lat, loc.lng]}
              icon={
                loc.is_principal
                  ? PRINCIPAL_ICON
                  : loc.is_active
                    ? ACTIVE_ICON
                    : INACTIVE_ICON
              }
              ref={(m) => {
                if (m) markerRefs.current.set(loc.id, m);
                else markerRefs.current.delete(loc.id);
              }}
              eventHandlers={{
                click: () => setSelectedId(loc.id),
              }}
            >
              <Popup>
                <div className="min-w-[220px] space-y-2 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <Store className="h-3.5 w-3.5 text-brand-700" /> {loc.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {loc.address}
                    {loc.city ? `, ${loc.city}` : ""}
                  </p>
                  <p className="text-xs">
                    {loc.is_active ? (
                      <span className="font-medium text-brand-700">Active</span>
                    ) : (
                      <span className="font-medium text-slate-400">Inactive</span>
                    )}
                    {loc.is_principal && " · Principal plant"}
                  </p>
                  {loc.profile_id ? (
                    <button
                      type="button"
                      onClick={() => openProfile(loc)}
                      className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
                    >
                      Open partner profile →
                    </button>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-slate-400">
                      <UserX className="h-3.5 w-3.5" /> No partner login linked
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
          {/* Fit to all pins on first load */}
          <FitToLocations points={points} enabled={locations.length > 1} />
        </MapContainer>
      </div>

      {/* Side list */}
      <div className="max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
        {locations.map((loc) => (
          <button
            key={loc.id}
            type="button"
            onClick={() => setSelectedId(loc.id)}
            onDoubleClick={() => openProfile(loc)}
            className={cn(
              "w-full rounded-xl border p-3.5 text-left transition",
              selectedId === loc.id
                ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-200"
                : "border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <MapPin
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    loc.is_principal ? "text-accent-600" : "text-brand-600"
                  )}
                />
                {loc.name}
              </p>
              {loc.is_principal ? (
                <Badge tone="warning">Principal</Badge>
              ) : loc.is_active ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="neutral">Inactive</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {loc.address}
              {loc.city ? `, ${loc.city}` : ""}
            </p>
            {loc.profile_id ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <BadgeCheck
                    className={cn(
                      "h-3.5 w-3.5",
                      loc.partner_approval === "approved"
                        ? "text-brand-600"
                        : "text-amber-500"
                    )}
                  />
                  {loc.partner_name ?? "Partner"} · {loc.partner_role ?? "partner"}
                </span>
                <span
                  role="link"
                  tabIndex={0}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProfile(loc);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProfile(loc);
                    }
                  }}
                >
                  Profile <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <UserX className="h-3.5 w-3.5" /> No partner login —{" "}
                <span className="text-brand-700">manage in Stockists</span>
              </p>
            )}
          </button>
        ))}
        {locations.length === 0 && (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            No locations configured yet.
          </p>
        )}
      </div>

      {/* Selected-location detail under the map/list grid */}
      {selected && (
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <Store className="h-4 w-4 text-brand-600" /> {selected.name}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {selected.address}
                {selected.city ? `, ${selected.city}` : ""}
                {selected.phone ? ` · ${selected.phone}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selected.is_principal && <Badge tone="warning">Principal plant</Badge>}
              {selected.is_active ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="neutral"><Ban className="h-3 w-3" /> Inactive</Badge>
              )}
              {selected.profile_id && (
                <button
                  type="button"
                  onClick={() => openProfile(selected)}
                  className={buttonClass("primary", "sm")}
                >
                  Open partner profile <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fit the map to every pin once on mount (and when the set changes). */
function FitToLocations({
  points,
  enabled,
}: {
  points: [number, number][];
  enabled: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [points, enabled, map]);
  return null;
}
