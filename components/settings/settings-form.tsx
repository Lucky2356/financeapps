"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { SettingsPageData } from "@/lib/data";
import { RISK_PROFILE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const router = useRouter();

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      currency: "RUB",
      demoMode: formData.get("demoMode") === "on",
      riskProfileCode: String(formData.get("riskProfileCode") ?? "MODERATE"),
      emergencyFundMonthsTarget: String(formData.get("emergencyFundMonthsTarget") ?? "6")
    };

    try {
      await apiClient.put("/settings", payload);
      toast.success("Настройки сохранены");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    }
  }

  return (
    <form onSubmit={submitSettings} className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Основные настройки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Валюта</Label>
            <select name="currency" defaultValue="RUB" disabled className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="RUB">RUB</option>
            </select>
            <p className="text-xs text-muted-foreground">В MVP используется рубль по умолчанию.</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-4">
            <span>
              <span className="block text-sm font-medium">Режим демо-данных</span>
              <span className="block text-xs text-muted-foreground">Можно показывать демо-набор при пустой базе.</span>
            </span>
            <input name="demoMode" type="checkbox" defaultChecked={data.demoMode} className="size-5 accent-primary" />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Риск и финансовая подушка</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Риск-профиль</Label>
            <select name="riskProfileCode" defaultValue={data.riskProfileCode} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {data.riskProfiles.map((profile) => (
                <option key={profile.id} value={profile.code}>
                  {RISK_PROFILE_LABELS[profile.code]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Выбранный профиль используется только для аналитики концентрации и риска портфеля.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Цель финансовой подушки</Label>
            <select name="emergencyFundMonthsTarget" defaultValue={data.emergencyFundMonthsTarget} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="3">3 месяца</option>
              <option value="6">6 месяцев</option>
              <option value="12">12 месяцев</option>
            </select>
          </div>
          <Button type="submit">Сохранить настройки</Button>
        </CardContent>
      </Card>
    </form>
  );
}
