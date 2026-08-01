import { readFileSync } from "node:fs";

// Single source of truth for the displayed version: package.json. Exposed as a
// public env var so the UI never drifts from the real release version.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version
  },
  // The app ships only as a static export wrapped in Tauri — Windows and
  // Android run the very same bundle and keep all data on the device. There is
  // no server build any more, hence no standalone output, no API routes and no
  // HTTP headers config (the webview CSP lives in src-tauri/tauri.conf.json).
  output: process.env.NEXT_OUTPUT === "export" ? "export" : undefined,
  images: {
    unoptimized: process.env.NEXT_OUTPUT === "export"
  },
  typedRoutes: false
};

export default nextConfig;
