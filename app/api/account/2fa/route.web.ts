import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { findCurrentUser } from "@/lib/auth/current-user";
import { verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, totpKeyUri, verifyTotp } from "@/lib/auth/totp";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Two-factor (TOTP) self-service for web accounts. The secret is generated on
// "setup" and stored, but 2FA only becomes active once a valid code confirms it
// on "enable". The secret is returned only during setup (for the QR/manual key)
// and never afterwards.
export async function GET() {
  const user = await findCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  return NextResponse.json({ enabled: user.twoFactorEnabled });
}

export async function POST(request: NextRequest) {
  try {
    const crossOrigin = assertSameOrigin(request);
    if (crossOrigin) return crossOrigin;

    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const limit = rateLimit(`2fa:${clientIp(request)}`, 10, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const db = requirePrisma();

    // Validate the request against a fixed schema so the branch taken is driven
    // by an allow-listed action — never by a raw user-controlled string — and
    // each action carries exactly the fields it needs.
    const parsed = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("setup") }),
        z.object({ action: z.literal("enable"), code: z.string().trim().min(6) }),
        z.object({ action: z.literal("disable"), password: z.string().min(1) })
      ])
      .safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Неизвестное действие." }, { status: 400 });
    }
    const data = parsed.data;

    switch (data.action) {
      case "setup": {
        const secret = generateTotpSecret();
        await db.user.update({
          where: { id: user.id },
          data: { twoFactorSecret: secret, twoFactorEnabled: false }
        });
        const otpauth = totpKeyUri(user.email, secret);
        const qr = await QRCode.toDataURL(otpauth);
        return NextResponse.json({ secret, otpauth, qr });
      }
      case "enable": {
        if (!user.twoFactorSecret) {
          return NextResponse.json({ error: "Сначала начните настройку 2FA." }, { status: 400 });
        }
        if (!verifyTotp(data.code, user.twoFactorSecret)) {
          return NextResponse.json({ error: "Неверный код. Попробуйте ещё раз." }, { status: 400 });
        }
        await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
        return NextResponse.json({ enabled: true });
      }
      case "disable": {
        if (!user.passwordHash || !(await verifyPassword(data.password, user.passwordHash))) {
          return NextResponse.json({ error: "Пароль неверен." }, { status: 400 });
        }
        await db.user.update({
          where: { id: user.id },
          data: { twoFactorEnabled: false, twoFactorSecret: null }
        });
        return NextResponse.json({ enabled: false });
      }
    }
  } catch (error) {
    return apiErrorResponse(error, "Не удалось обновить настройки 2FA.");
  }
}
