import type { MiddlewareHandler } from "hono";

/**
 * Security headers middleware.
 * CSP uses 'unsafe-inline' for scripts because layout.ts injects inline JS
 * (MAP_JS, SUBMIT_MAP_JS) and HTMX is loaded from CDN. If we ever move to
 * nonces, the inline scripts in layout.ts must switch to nonce-based loading.
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const isHtml = (c.res.headers.get("Content-Type") ?? "").includes("text/html");
  const isXml = (c.res.headers.get("Content-Type") ?? "").includes("application/xml");

  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );

  if (isHtml) {
    c.res.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
        "img-src 'self' https://*.tile.openstreetmap.org https://xwqckmkjciptlbopmxjl.supabase.co data:",
        "connect-src 'self'",
        "font-src 'self' https://fonts.gstatic.com",
        "frame-src 'none'",
      ].join("; "),
    );
  }

  if (isXml) {
    c.res.headers.set("Content-Type", "application/xml; charset=utf-8");
  }
};
