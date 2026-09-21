import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = [
  "/shop",
  "/cart",
  "/checkout",
  "/orders",
  "/account",
  "/onboarding",
  "/admin",
  "/courier",
  "/stockist",
  "/pending-approval",
];

/** Auth routes that a signed-in user should be redirected away from. */
const AUTH_ROUTES = ["/login", "/register"];

/** The holding screen pending partners are locked to (plus auth pages). */
const PENDING_ALLOWED_PREFIXES = ["/pending-approval"];

/**
 * Refreshes the Supabase auth session on every request and enforces
 * coarse-grained route protection. Fine-grained authorisation (ownership,
 * admin role) is still enforced server-side in pages/route handlers.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // If Supabase isn't configured yet, don't block the app — let pages render
  // a friendly "finish setup" state.
  if (!config.supabase.url || !config.supabase.anonKey) {
    return response;
  }

  const supabase = createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not remove — refreshes the token and returns the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!user && isProtected && !pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/shop";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // -----------------------------------------------------------------------
  // Partner approval gate: pending riders & stockists may only reach the
  // hold screen (and sign out). Auth pages are exempt so "Check again" /
  // re-login flows still work; API routes do their own checks.
  // -----------------------------------------------------------------------
  const pendingAllowed = PENDING_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (user && isProtected && !pendingAllowed) {
    const { data: access } = await supabase
      .from("profiles")
      .select("role, approval_status")
      .eq("id", user.id)
      .maybeSingle();

    const role = access?.role as string | undefined;
    const status = access?.approval_status as string | undefined;

    // Admins/vendors/customers always pass; partners must be approved.
    const alwaysAllowed =
      role === "admin" || role === "vendor" || role === "customer";
    const partnerApproved = status === "approved";

    if (!alwaysAllowed && !partnerApproved) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
