import { NextRequest, NextResponse } from "next/server";

import { getSettingsPageData } from "@/lib/data";
import { apiErrorResponse } from "@/lib/api/route-errors";
import { requirePrisma } from "@/lib/prisma";
import { findCurrentUser } from "@/lib/auth/current-user";
import { settingsSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettingsPageData());
}

export async function PUT(request: NextRequest) {
  try {
    const db = requirePrisma();
    const user = await findCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

    const input = settingsSchema.parse(await request.json());
    const riskProfile = await db.riskProfile.findUnique({ where: { code: input.riskProfileCode } });
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        currency: input.currency,
        demoMode: input.demoMode,
        emergencyFundMonthsTarget: input.emergencyFundMonthsTarget,
        riskProfileId: riskProfile?.id ?? user.riskProfileId,
        // Persist the rest of the settings (undefined fields are left untouched).
        theme: input.theme,
        density: input.density,
        defaultTransactionType: input.defaultTransactionType,
        autoMaterializeRecurring: input.autoMaterializeRecurring,
        paymentReminders: input.paymentReminders,
        aiEnabled: input.aiEnabled,
        aiApiKey: input.aiApiKey,
        aiModel: input.aiModel
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Не удалось сохранить настройки.");
  }
}
