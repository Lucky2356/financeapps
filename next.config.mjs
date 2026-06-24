/** @type {import('next').NextConfig} */
const nextConfig = {
  output:
    process.env.NEXT_OUTPUT === "export"
      ? "export"
      : process.env.NEXT_OUTPUT === "standalone"
        ? "standalone"
        : undefined,
  // Web-only routes/pages use a `.web.ts(x)` extension so they are compiled in
  // the web/standalone build but EXCLUDED from the desktop static export (which
  // forbids dynamic routes). Desktop talks to LocalApiClient, never to /api.
  pageExtensions:
    process.env.NEXT_OUTPUT === "export"
      ? ["tsx", "ts", "jsx", "js"]
      : ["web.tsx", "web.ts", "tsx", "ts", "jsx", "js"],
  images: {
    unoptimized: process.env.NEXT_OUTPUT === "export"
  },
  typedRoutes: false,
  ...(process.env.NEXT_OUTPUT !== "export" && {
    headers: async () => [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS: enforce HTTPS once served over TLS. Honored only over HTTPS and
          // ignored for bare-IP hosts, so the current IP+self-signed setup is
          // unaffected; protects future domain deployments.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()"
          },
          { key: "X-XSS-Protection", value: "1; mode=block" }
        ]
      }
    ]
  })
};

export default nextConfig;
