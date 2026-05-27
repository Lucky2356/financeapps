import { NextRequest, NextResponse } from "next/server";

import { requirePrisma } from "@/lib/prisma";
import { UserBackupService } from "@/services/backup/UserBackupService";

export const dynamic = "force-static";

export async function GET() {
  try {
    const backup = await new UserBackupService(requirePrisma()).exportFirstUser();
    return NextResponse.json(backup);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backup export failed" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { backup } = (await request.json()) as { backup?: unknown };
    const result = await new UserBackupService(requirePrisma()).restoreFirstUser(backup);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Backup restore failed" }, { status: 400 });
  }
}
