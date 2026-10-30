import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { rateLimit, RATE_LIMITS } from "@/lib/cache/rate-limit";

const { auth } = NextAuth(authConfig);

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // mapbox-gl injects inline styles at runtime; next/font is self-hosted
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `worker-src 'self' blob:`,
    `connect-src 'self' https://api.mapbox.com https://events.mapbox.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  // ── Per-IP rate limits on the API surface (§9/§10) ──────────────────────
  if (pathname.startsWith("/api/")) {
    const bucket = pathname.startsWith("/api/auth") ? "auth" : "api";
    const { limit, windowSeconds } = RATE_LIMITS[bucket];
    const { allowed } = await rateLimit(bucket, clientIp(req), limit, windowSeconds);
    if (!allowed) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: { "Retry-After": String(windowSeconds) },
      });
    }
    return NextResponse.next();
  }

  // ── Admin gate: everything under /admin except the login page ───────────
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!req.auth?.user) {
      const login = new URL("/admin/login", req.nextUrl.origin);
      login.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(login);
    }
  }

  // ── Nonce-based CSP on document requests ─────────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  // Skip static assets; everything else passes through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
