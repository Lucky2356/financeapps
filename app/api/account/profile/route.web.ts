import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

// Account profile for web users: read the display name / email / join date and
// update the display name. Web-only — desktop has no auth. The email is
// read-only here: changing it safely needs verification (SMTP), which is out of
// scope for now, so we surface it but do not allow editing.

const schema = z.object({
  name: z.string().trim().min(1, "Введите имя.").max(120)
});

export async function GET() {
  try {
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });
    return NextResponse.json({
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось загрузить профиль.");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const limit = rateLimit(`profile:${clientIp(request)}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });

    const { name } = schema.parse(await request.json());
    const db = requirePrisma();
    const updated = await db.user.update({
      where: { id: user.id },
      data: { name },
      select: { name: true, email: true, createdAt: true }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось сохранить профиль.");
  }
}
