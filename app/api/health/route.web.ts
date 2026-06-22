import { NextResponse } from "next/server";

import { shouldUseBuildFallbackData } from "@/lib/build-mode";
import { APP_VERSION } from "@/lib/constants";
import { runtimeConfig } from "@/lib/platform/env";
import { prisma } from "@/lib/prisma";

// Web-only route (.web.ts) — excluded from the desktop static export, so it can
// be fully dynamic and return live data.
export const dynamic = "force-dynamic";

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
