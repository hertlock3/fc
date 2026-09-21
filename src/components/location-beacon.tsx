"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, Satellite, ShieldOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LocationBeacon — the rider's phone GPS beacon.
 *
 * While the rider has an active trip, this component requests geolocation
 * (foreground) and POSTs a ping to /api/courier/location every ~10 seconds.
 * The customer's order page polls /api/orders/[id]/tracking and animates the
 * rider marker on the live map.
 *
 * Deliberately simple: no background tracking, no wake locks — the browser
 * tab must stay open, which is exactly what the courier portal is for.
 */
export function LocationBeacon({ orderId }: { orderId: string }) {
  const [state, setState] = useState<
    "idle" | "starting" | "live" | "error" | "denied"
  >("idle");
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const sending = useRef(false);

  // Stop the watch when the portal unmounts.
  useEffect(() => stop, []);

  function stop() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      latest.current = null;
    }
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }

  async function send() {
    const pos = latest.current;
    if (!pos || sending.current) return;
    sending.current = true;
    try {
      const res = await fetch("/api/courier/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          heading: pos.coords.heading != null && Number.isFinite(pos.coords.heading)
            ? pos.coords.heading
            : undefined,
          speed: pos.coords.speed != null && Number.isFinite(pos.coords.speed)
            ? pos.coords.speed
            : undefined,
        }),
      });
      if (res.ok) {
        setLastSent(new Date());
        setState("live");
        setErrorMsg(null);
      } else if (res.status === 403 || res.status === 404) {
        // Trip over / unassigned → stop the beacon quietly.
        stop();
        setState("idle");
      } else {
        const data = await res.json().catch(() => null);
        setErrorMsg((data as { error?: string })?.error ?? "Upload failed");
        setState("error");
      }
    } catch {
      setErrorMsg("No connection — retrying…");
    } finally {
      sending.current = false;
    }
  }

  function start() {
    if (!("geolocation" in navigator)) {
      setState("error");
      setErrorMsg("This browser does not support location sharing.");
      return;
    }
    setState("starting");
    setErrorMsg(null);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        // First fix arrives → send immediately, then ping every 10s.
        if (timer.current === null) {
          send();
          timer.current = setInterval(send, 10_000);
        }
      },
      (err) => {
        stop();
        if (err.code === err.PERMISSION_DENIED) {
          setState("denied");
        } else {
          setState("error");
          setErrorMsg(
            err.code === err.POSITION_UNAVAILABLE
              ? "Location unavailable — check GPS is on."
              : "Location request timed out. Try again."
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    );
  }

  const badge = {
    idle: { icon: Navigation, text: "", cls: "" },
    starting: { icon: Loader2, text: "Starting GPS…", cls: "bg-slate-100 text-slate-600" },
    live: {
      icon: Satellite,
      text: "Live — customer can see you",
      cls: "bg-emerald-600 text-white",
    },
    error: { icon: ShieldOff, text: errorMsg ?? "Location error", cls: "bg-red-50 text-red-700" },
    denied: {
      icon: ShieldOff,
      text: "Location permission denied — enable it in your browser",
      cls: "bg-red-50 text-red-700",
    },
  }[state];

  const Icon = badge.icon;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {state === "idle" ? (
        <button
          onClick={start}
          className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <Icon className="h-4 w-4" />
          Share live location with the customer
        </button>
      ) : state === "denied" || state === "error" ? (
        <button
          onClick={start}
          className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
        >
          <Icon className="h-4 w-4" />
          Retry location sharing
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium",
              badge.cls
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                state === "starting" && "animate-spin",
                state === "live" && "animate-pulse"
              )}
            />
            {badge.text}
          </span>
          {state === "live" && lastSent && (
            <span className="text-xs text-slate-400">
              last ping {lastSent.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => {
              stop();
              setState("idle");
            }}
            className="ml-auto text-xs font-medium text-slate-400 underline hover:text-slate-600"
          >
            Stop sharing
          </button>
        </div>
      )}
      {(state === "error" || state === "denied") && errorMsg && (
        <p className="mt-2 text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
