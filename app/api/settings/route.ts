import { NextRequest, NextResponse } from "next/server";

import { getSettingsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { settingsSchema } from "@/lib/validations";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(await getSettingsPageData());
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Demo user not found. Run seed first." }, { status: 404 });

    const input = settingsSchema.parse(await request.json());
    const riskProfile = await db.riskProfile.findUnique({ where: { code: input.riskProfileCode } });
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        currency: input.currency,
        demoMode: input.demoMode,
        emergencyFundMonthsTarget: input.emergencyFundMonthsTarget,
        riskProfileId: riskProfile?.id ?? user.riskProfileId
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось сохранить настройки.");
  }
}
