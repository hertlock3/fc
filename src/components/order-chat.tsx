"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Crosshair, MessageSquare, Send } from "lucide-react";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

interface Message {
  id: string;
  sender_id: string;
  sender_role: "customer" | "courier" | "admin" | "vendor";
  kind: "text" | "photo" | "location";
  body: string | null;
  image_path: string | null;
  image_url?: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

const ROLE_LABEL: Record<Message["sender_role"], string> = {
  customer: "Customer",
  courier: "Rider",
  admin: "FC Support",
  vendor: "FC Dispatch",
};

const ROLE_TONE: Record<Message["sender_role"], string> = {
  customer: "bg-slate-100 text-slate-800",
  courier: "bg-sky-100 text-sky-900",
  admin: "bg-brand-100 text-brand-900",
  vendor: "bg-brand-100 text-brand-900",
};

/**
 * Order chat — customer, rider and FC staff in one thread.
 * Polls every 5s while visible; supports text, photos (dispute evidence)
 * and live-location sharing. All authorisation is server-side.
 */
export function OrderChat({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setError("Chat is available to the customer, rider and FC staff.");
        }
        return;
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
      setMe(data.me?.id ?? null);
      setError(null);
    } catch {
      /* transient network error — keep previous messages */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // `load` awaits before any setState, so the effect body itself never
    // calls setState synchronously; defer one microtask to make that
    // explicit to React's compiler lint rule.
    const kickoff = Promise.resolve().then(load);
    const timer = setInterval(load, 5000);
    return () => {
      Promise.resolve(kickoff).catch(() => {});
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "text", text: body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not send.");
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  async function sendLocation() {
    if (!navigator.geolocation) {
      setError("Location sharing is not supported on this device.");
      return;
    }
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/orders/${orderId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "location",
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          if (!res.ok) throw new Error("Could not share location.");
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not share location.");
        } finally {
          setSending(false);
        }
      },
      () => {
        setError("Location permission denied.");
        setSending(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function sendPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Upload failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex h-[480px] flex-col">
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Loading chat…
          </p>
        ) : messages.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <MessageSquare className="h-4 w-4" />
            No messages yet — say hello or share your gate number.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === me;
            const showMap = m.kind === "location" && m.lat != null && m.lng != null;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%]">
                  <p className={`mb-0.5 text-[11px] ${mine ? "text-right" : ""} text-slate-400`}>
                    {ROLE_LABEL[m.sender_role]} · {formatDateTime(m.created_at)}
                  </p>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                      mine ? "bg-brand-600 text-white" : ROLE_TONE[m.sender_role]
                    }`}
                  >
                    {m.kind === "photo" && m.image_url ? (
                      <a href={m.image_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.image_url}
                          alt={m.body ?? "Shared photo"}
                          className="max-h-56 rounded-lg"
                        />
                      </a>
                    ) : showMap ? (
                      <a
                        href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 underline"
                      >
                        <Crosshair className="h-4 w-4" /> Live location (tap to open map)
                      </a>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendPhoto(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Upload a photo of the produce"
          aria-label="Upload a photo"
        >
          {uploading ? <Spinner /> : <Camera className="h-5 w-5" />}
        </button>
        <button
          onClick={sendLocation}
          disabled={sending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Share my live location"
          aria-label="Share my location"
        >
          <Crosshair className="h-5 w-5" />
        </button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText();
            }
          }}
          placeholder="Message the rider / FC support…"
          aria-label="Message"
        />
        <Button size="sm" onClick={sendText} disabled={sending || !text.trim()}>
          {sending ? <Spinner /> : <Send className="h-4 w-4" />}
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}
