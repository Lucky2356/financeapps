import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, "Пароль должен быть не короче 8 символов").max(200)
});

// In-session password change for web users (no email required). Verifies the
// current password before updating the hash.
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`password:${clientIp(request)}`, 5, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован." }, { status: 401 });
    if (!user.passwordHash)
      return NextResponse.json({ error: "У аккаунта нет пароля." }, { status: 400 });

    const { currentPassword, newPassword } = schema.parse(await request.json());
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Текущий пароль неверен." }, { status: 400 });

    const db = requirePrisma();
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось изменить пароль.");
  }
}
