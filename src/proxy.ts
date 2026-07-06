import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF hardening for all mutating API calls: when a browser sends an Origin
 * header it must match the site's own host, or the request is rejected.
 * Requests WITHOUT an Origin header pass — the Studio plugin (HttpService),
 * Stripe webhooks, and Zoho are server-to-server and never send one. This is
 * defense-in-depth on top of SameSite=Lax session cookies.
 */
export function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();

  const requestHost = request.headers.get("host");
  try {
    if (new URL(origin).host !== requestHost) {
      return NextResponse.json(
        { error: "Cross-origin request rejected" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
