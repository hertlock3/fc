"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, ShoppingBasket } from "lucide-react";
import { Button, Spinner } from "@/components/ui";

export function AddToCartButton({
  productId,
  isAuthed,
  size = "sm",
  className,
}: {
  productId: string;
  isAuthed: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "added" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleAdd() {
    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent("/shop")}`);
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add to cart");
      setState("added");
      router.refresh();
      setTimeout(() => setState("idle"), 1600);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <div className={className}>
      <Button
        variant={state === "added" ? "primary" : "secondary"}
        size={size}
        onClick={handleAdd}
        disabled={state === "loading"}
        className="w-full"
        aria-live="polite"
      >
        {state === "loading" ? (
          <Spinner />
        ) : state === "added" ? (
          <>
            <Check className="h-4 w-4" /> Added
          </>
        ) : isAuthed ? (
          <>
            <Plus className="h-4 w-4" /> Add to cart
          </>
        ) : (
          <>
            <ShoppingBasket className="h-4 w-4" /> Sign in to buy
          </>
        )}
      </Button>
      {message && (
        <p className="mt-1.5 text-center text-xs text-red-600">{message}</p>
      )}
    </div>
  );
}
