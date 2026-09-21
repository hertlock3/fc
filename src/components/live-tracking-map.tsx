"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bike, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LiveTrackingMap — customer-side live rider tracking.
 *
 * Polls /api/orders/[id]/tracking every 8 seconds while the order is out for
 * delivery and animates the rider marker on a Leaflet map between the
 * stockist pickup and the customer's door. Keeps working even if the rider
 * hasn't shared location yet (shows the route leg only).
 */

export interface TrackingState {
  rider: {
    lat: number;
    lng: number;
    accuracy_m: number | null;
    speed_mps: number | null;
    updated_at: string;
  } | null;
  pickup: { name: string; lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  is_live: boolean;
}

const RIDER_ICON = L.divIcon({
  className: "fc-rider-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1" fill="#15803d"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
  </svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const PICKUP_ICON = L.divIcon({
  className: "fc-pickup-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 30 40" fill="none">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 13.2 23.4 13.76 23.94a1.75 1.75 0 0 0 2.48 0C16.8 38.4 30 25.5 30 15 30 6.716 23.284 0 15 0Z" fill="#b45309"/>
    <circle cx="15" cy="15" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [26, 34],
  iconAnchor: [13, 34],
});

const DROPOFF_ICON = L.divIcon({
  className: "fc-dropoff-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 30 40" fill="none">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 13.2 23.4 13.76 23.94a1.75 1.75 0 0 0 2.48 0C16.8 38.4 30 25.5 30 15 30 6.716 23.284 0 15 0Z" fill="#1d4ed8"/>
    <circle cx="15" cy="15" r="5.5" fill="white"/>
  </svg>`,
  iconSize: [26, 34],
  iconAnchor: [13, 34],
});

/** Fit the map to all points whenever they change meaningfully. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fitted = useRef<string>("");
  useEffect(() => {
    if (points.length < 2) return;
    const key = JSON.stringify(
      points.map(([lat, lng]) => [lat.toFixed(3), lng.toFixed(3)])
    );
    if (key === fitted.current) return;
    fitted.current = key;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export function LiveTrackingMap({
  orderId,
  initialPickup,
  initialDropoff,
  className,
}: {
  orderId: string;
  /** Server-rendered defaults so the map renders before the first poll. */
  initialPickup: { name: string; lat: number; lng: number } | null;
  initialDropoff: { lat: number; lng: number } | null;
  className?: string;
}) {
  const [tracking, setTracking] = useState<TrackingState>({
    rider: null,
    pickup: initialPickup,
    dropoff: initialDropoff,
    is_live: false,
  });
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/tracking`);
        if (!res.ok) return;
        const data = (await res.json()) as { tracking: TrackingState };
        if (cancelled || !data.tracking) return;
        setTracking(data.tracking);
        setStale(!data.tracking.is_live);
      } catch {
        // Transient network error — keep the last known position.
      }
    }

    poll();
    const timer = setInterval(poll, 8_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId]);

  const riderPos: [number, number] | null = tracking.rider
    ? [tracking.rider.lat, tracking.rider.lng]
    : null;

  const points: [number, number][] = [
    ...(tracking.pickup ? [[tracking.pickup.lat, tracking.pickup.lng] as [number, number]] : []),
    ...(riderPos ? [riderPos] : []),
    ...(tracking.dropoff ? [[tracking.dropoff.lat, tracking.dropoff.lng] as [number, number]] : []),
  ];

  // Straight-line rider → door distance (indicative only).
  const remainingKm =
    riderPos && tracking.dropoff
      ? haversine(riderPos, [tracking.dropoff.lat, tracking.dropoff.lng])
      : null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative isolate h-72 w-full overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={riderPos ?? (tracking.pickup ? [tracking.pickup.lat, tracking.pickup.lng] : [-1.2864, 36.8172])}
          zoom={13}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {tracking.pickup && (
            <Marker position={[tracking.pickup.lat, tracking.pickup.lng]} icon={PICKUP_ICON}>
              <Popup>{tracking.pickup.name}</Popup>
            </Marker>
          )}
          {tracking.dropoff && (
            <Marker position={[tracking.dropoff.lat, tracking.dropoff.lng]} icon={DROPOFF_ICON}>
              <Popup>Your delivery address</Popup>
            </Marker>
          )}
          {riderPos && (
            <Marker position={riderPos} icon={RIDER_ICON}>
              <Popup>Your rider</Popup>
            </Marker>
          )}
          {riderPos && tracking.dropoff && (
            <Polyline
              positions={[riderPos, [tracking.dropoff.lat, tracking.dropoff.lng]]}
              pathOptions={{ color: "#15803d", weight: 3, dashArray: "6 8", opacity: 0.7 }}
            />
          )}
          <FitBounds points={points} />
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {riderPos && tracking.rider && (
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <Bike className="h-3.5 w-3.5 text-brand-600" />
            {tracking.rider.speed_mps != null
              ? `Rider moving at ${(tracking.rider.speed_mps * 3.6).toFixed(0)} km/h`
              : "Rider position updating"}
            {tracking.rider.accuracy_m != null
              ? ` · ±${Math.round(tracking.rider.accuracy_m)} m`
            : ""}
          </span>
        )}
        {remainingKm != null && (
          <span>{remainingKm.toFixed(1)} km from your door (straight line)</span>
        )}        {riderPos && stale && (
          <span className="flex items-center gap-1 text-amber-600">
            <RefreshCw className="h-3 w-3" /> reconnecting — last update {" "}
            {tracking.rider ? new Date(tracking.rider.updated_at).toLocaleTimeString() : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/** Haversine distance in km (client-safe duplicate of lib/pricing math). */
function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
