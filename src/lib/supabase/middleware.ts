import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = ["/shop", "/cart", "/checkout", "/orders", "/account", "/onboarding", "/admin"];

/** Auth routes that a signed-in user should be redirected away from. */
const AUTH_ROUTES = ["/login", "/register"];

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

  return response;
}
