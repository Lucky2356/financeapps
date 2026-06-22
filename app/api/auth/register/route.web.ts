import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { provisionNewUser } from "@/lib/auth/provisioning";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/api/rate-limit";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов").max(200),
  name: z.string().trim().min(1).max(120).optional()
});

// Registers a new web user (email + password) and provisions their default
// categories — the new account starts empty (demoMode off), isolated by userId.
export async function POST(request: NextRequest) {
  try {
    // Throttle signups per IP to blunt abuse/enumeration.
    const limit = rateLimit(`register:${clientIp(request)}`, 5, 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const db = requirePrisma();
    const { email, password, name } = registerSchema.parse(await request.json());
    const normalizedEmail = email.toLowerCase();

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: name?.trim() || normalizedEmail.split("@")[0],
          passwordHash,
          demoMode: false
        }
      });
      await provisionNewUser(tx, created.id);
      return created;
    });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Не удалось зарегистрировать пользователя.");
  }
}
