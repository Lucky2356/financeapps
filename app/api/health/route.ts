import { NextResponse } from "next/server";

import { runtimeConfig } from "@/lib/platform/env";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "financial-assistant",
    runtime: runtimeConfig
  });
}
