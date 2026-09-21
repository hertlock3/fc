"use client";

import dynamic from "next/dynamic";
import type { TrackingState } from "@/components/live-tracking-map";

/**
 * Browser-only loader for the Leaflet tracking map.
 *
 * Leaflet touches `window` at import time, so importing LiveTrackingMap
 * directly from a server component crashes SSR. This wrapper dynamic-imports
 * it with `ssr: false` — the same pattern the address form uses for the map
 * pin picker.
 */
const LiveTrackingMap = dynamic(
  () => import("@/components/live-tracking-map").then((mod) => mod.LiveTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
        Loading live tracking…
      </div>
    ),
  }
);

export function LiveTrackingMapClient(
  props: Omit<React.ComponentProps<typeof LiveTrackingMap>, never> & {
    orderId: string;
    initialPickup: TrackingState["pickup"];
    initialDropoff: TrackingState["dropoff"];
  }
) {
  return <LiveTrackingMap {...props} />;
}
