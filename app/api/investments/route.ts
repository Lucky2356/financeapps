import { NextResponse } from "next/server";

import { getInvestmentData } from "@/lib/data";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getInvestmentData());
}
