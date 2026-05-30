import { NextResponse } from "next/server";

import { getAnalyticsData } from "@/lib/data";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getAnalyticsData());
}
