import { NextResponse } from "next/server";

import { runtimeConfig } from "@/lib/platform/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-static";

export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "unavailable" = "unavailable";
  let seeded = false;

  if (prisma) {
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
    version: "0.1.0",
    database,
    seeded,
    runtime: runtimeConfig,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt
  });
}
