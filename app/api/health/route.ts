import { NextResponse } from "next/server";

import { shouldUseBuildFallbackData } from "@/lib/build-mode";
import { APP_VERSION } from "@/lib/constants";
import { runtimeConfig } from "@/lib/platform/env";
import { prisma } from "@/lib/prisma";

// force-static is required for NEXT_OUTPUT=export (Tauri/Capacitor shell).
// Trade-off: in web deployments the GET response is a build-time snapshot.
// For a real-time health check in web-only deployments, change this to
// "force-dynamic" (then build:static must be run separately or excluded).
export const dynamic = "force-static";

export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "unavailable" = "unavailable";
  let seeded = false;

  if (prisma && !shouldUseBuildFallbackData()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
      seeded = (await prisma.user.count()) > 0;
    } catch {
      database = "unavailable";
    }
  }

  return NextResponse.json({
    ok: database === "ok",
    app: "financial-assistant",
    version: APP_VERSION,
    database,
    seeded,
    runtime: runtimeConfig,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt
  });
}
