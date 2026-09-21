import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts correctly. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a short, URL-safe human-ish reference (used for order numbers). */
export function generateReference(prefix: string, length = 8): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusing chars
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}${out}`;
}

/** Normalise a Kenyan phone number into the 2547XXXXXXXX / 2541XXXXXXXX form. */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let value = digits;

  if (value.startsWith("0")) value = `254${value.slice(1)}`;
  else if (value.startsWith("7") || value.startsWith("1")) value = `254${value}`;
  else if (value.startsWith("254")) value = value;

  // Valid Safaricom/Airtel Kenyan mobile prefixes (7xx / 1xx) = 12 digits total.
  if (!/^254(7|1)\d{8}$/.test(value)) return null;
  return value;
}

/**
 * Convert free text into a URL-safe slug, e.g. "Streaky Bacon!" → "streaky-bacon".
 * Used to derive product/category slugs in the admin catalog manager.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Format a Date/ISO string into a short Kenyan-style date-time. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

