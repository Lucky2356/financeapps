"use client";

import { Keyboard, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { applyDensity } from "@/components/app-settings-sync";
import type { SettingsPageData } from "@/lib/data";
import { RISK_PROFILE_LABELS } from "@/lib/constants";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const shortcuts = [
  { keys: "Alt+N", label: "Быстро добавить операцию" },
  { keys: "Alt+T", label: "Перейти к операциям" },
  { keys: "Alt+D", label: "Перейти на главную" },
  { keys: "Alt+A", label: "Перейти к аналитике" },
  { keys: "?", label: "Показать эту справку" },
];

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { data: pageData, reload } = useApiPageData(data, "/settings");
  const [clearing, setClearing] = useState(false);
  // null = user hasn't manually picked yet → fall back to loaded pageData value
  const [userTheme, setUserTheme] = useState<"light" | "dark" | "system" | null>(null);
  const [userDensity, setUserDensity] = useState<"comfortable" | "compact" | null>(null);
  const selectedTheme = userTheme ?? pageData.theme ?? "system";
  const selectedDensity = userDensity ?? pageData.density ?? "comfortable";

  // key forces remount of uncontrolled inputs when data loads from IndexedDB
  const formKey = `${pageData.riskProfileCode}-${pageData.emergencyFundMonthsTarget}-${String(pageData.demoMode)}-${selectedTheme}-${selectedDensity}-${pageData.defaultTransactionType}`;

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      currency: "RUB",
      demoMode: formData.get("demoMode") === "on",
      riskProfileCode: String(formData.get("riskProfileCode") ?? "MODERATE"),
      emergencyFundMonthsTarget: String(formData.get("emergencyFundMonthsTarget") ?? "6"),
      theme: String(formData.get("theme") ?? "system"),
      density: String(formData.get("density") ?? "comfortable"),
      defaultTransactionType: String(formData.get("defaultTransactionType") ?? "EXPENSE"),
    };

    try {
      await apiClient.put("/settings", payload);
      setTheme(payload.theme);
      applyDensity(payload.density === "compact" ? "compact" : "comfortable");
      toast.success("Настройки сохранены");
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    }
  }

  async function clearAllData() {
    try {
      setClearing(true);
      await apiClient.delete("/storage/clear");
      toast.success("Данные очищены.");
      // Give IndexedDB time to finish the write before reload
      await new Promise((r) => setTimeout(r, 600));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось очистить данные");
      setClearing(false);
    }
  }

  return (
    <form key={formKey} onSubmit={submitSettings} className="grid gap-5 xl:grid-cols-2">
      {/* Card 1: Basic */}
      <Card>
        <CardHeader>
          <CardTitle>Основные настройки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Валюта</Label>
            <select name="currency" defaultValue="RUB" disabled className="h-10 w-full rounded-md border bg-background px-3 text-sm opacity-60">
              <option value="RUB">RUB — Российский рубль</option>
            </select>
            <p className="text-xs text-muted-foreground">Поддержка других валют запланирована в следующих версиях.</p>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted/30">
            <span>
              <span className="block text-sm font-medium">Режим демо-данных</span>
              <span className="block text-xs text-muted-foreground">Показывает встроенный набор при пустой базе.</span>
            </span>
            <input name="demoMode" type="checkbox" defaultChecked={pageData.demoMode} className="size-5 accent-primary" />
          </label>
        </CardContent>
      </Card>

      {/* Card 2: Risk & Emergency Fund */}
      <Card>
        <CardHeader>
          <CardTitle>Риск и финансовая подушка</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Риск-профиль</Label>
            <select name="riskProfileCode" defaultValue={pageData.riskProfileCode} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {pageData.riskProfiles.map((profile) => (
                <option key={profile.id} value={profile.code}>
                  {RISK_PROFILE_LABELS[profile.code]} — {profile.description}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Используется для анализа концентрации и риска в инвестиционном портфеле.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Цель финансовой подушки</Label>
            <select name="emergencyFundMonthsTarget" defaultValue={pageData.emergencyFundMonthsTarget} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="3">3 месяца расходов</option>
              <option value="6">6 месяцев расходов</option>
              <option value="12">12 месяцев расходов</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Рекомендуется минимум 3 месяца. 6–12 — для большей уверенности.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Внешний вид</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Тема оформления</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "light", label: "Светлая", icon: Sun },
                { value: "system", label: "Системная", icon: Monitor },
                { value: "dark", label: "Тёмная", icon: Moon },
              ] as const).map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm transition-colors hover:bg-muted/40",
                    selectedTheme === value && "border-primary bg-primary/8 font-medium text-primary"
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={selectedTheme === value}
                    onChange={() => { setUserTheme(value); setTheme(value); }}
                    className="sr-only"
                  />
                  <Icon className="size-5" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Плотность интерфейса</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "comfortable", label: "Комфортная" },
                { value: "compact", label: "Компактная" },
              ] as const).map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center justify-center rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40",
                    selectedDensity === value && "border-primary bg-primary/8 font-medium text-primary"
                  )}
                >
                  <input
                    type="radio"
                    name="density"
                    value={value}
                    checked={selectedDensity === value}
                    onChange={() => { setUserDensity(value); applyDensity(value); }}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 4: Operations */}
      <Card>
        <CardHeader>
          <CardTitle>Операции</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Тип операции по умолчанию</Label>
            <select name="defaultTransactionType" defaultValue={pageData.defaultTransactionType} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Будет выбран при открытии формы быстрого добавления.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save button — full width */}
      <div className="xl:col-span-2">
        <Button type="submit" size="lg">Сохранить настройки</Button>
      </div>

      {/* Card 5: About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="size-4" />
            Горячие клавиши
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {shortcuts.map((s) => (
              <div key={s.keys} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{s.keys}</kbd>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Финансовый помощник&nbsp;·&nbsp;версия 1.0.0
          </p>
        </CardContent>
      </Card>

      {/* Card 6: Data Management */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Управление данными</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Очистка удалит все счета, операции, цели, бюджеты и настройки. Это действие необратимо.
          </p>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" type="button" className="w-full">
                <Trash2 className="size-4" />
                Очистить все данные
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Очистить все данные?</DialogTitle>
                <DialogDescription>
                  Все ваши операции, счета, цели, бюджеты, плановые платежи, портфель и настройки будут безвозвратно удалены.
                  Резервную копию можно сохранить на странице Импорт.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
                Это действие нельзя отменить. Сначала сделайте резервную копию.
              </div>
              <DialogFooter>
                <Button variant="destructive" onClick={clearAllData} disabled={clearing}>
                  {clearing ? "Очистка..." : "Да, удалить всё"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </form>
  );
}
