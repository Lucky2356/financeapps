import { NextRequest, NextResponse } from "next/server";

import { findCurrentUser } from "@/lib/auth/current-user";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { requirePrisma } from "@/lib/prisma";
import { UserBackupService } from "@/services/backup/UserBackupService";

export const dynamic = "force-dynamic";

// Full export/restore of the caller's own data. Both handlers are gated by the
// session user and scoped to user.id — never the "first user" — so one account
// can neither read nor overwrite another's financial data.
export async function GET() {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`backup:export:${user.id}`, 5, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const backup = await new UserBackupService(requirePrisma()).exportForUser(user.id);
    return NextResponse.json(backup);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось выгрузить резервную копию.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`backup:restore:${clientIp(request)}`, 5, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { backup } = (await request.json()) as { backup?: unknown };
    const result = await new UserBackupService(requirePrisma()).restoreForUser(user.id, backup);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось восстановить резервную копию.");
  }
}
