"use client";

import { Check, Keyboard, Loader2, Monitor, Moon, Sparkles, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
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

type EditableSettings = {
  demoMode: boolean;
  riskProfileCode: SettingsPageData["riskProfileCode"];
  emergencyFundMonthsTarget: number;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  defaultTransactionType: "INCOME" | "EXPENSE";
};

function toEditable(data: SettingsPageData): EditableSettings {
  return {
    demoMode: data.demoMode,
    riskProfileCode: data.riskProfileCode,
    emergencyFundMonthsTarget: data.emergencyFundMonthsTarget,
    theme: data.theme ?? "system",
    density: data.density ?? "comfortable",
    defaultTransactionType: data.defaultTransactionType,
  };
}

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const { setTheme } = useTheme();
  const { data: pageData, reload } = useApiPageData(data, "/settings");
  const [clearing, setClearing] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [settings, setSettings] = useState<EditableSettings>(() => toEditable(pageData));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Re-sync controlled fields whenever fresh data arrives (e.g. the real values
  // load from IndexedDB after mount, or a save round-trips through reload()).
  // Derived-state-on-prop-change pattern — adjusts state during render instead
  // of in an effect, so there is no extra paint with stale values.
  const [syncedFrom, setSyncedFrom] = useState(pageData);
  if (syncedFrom !== pageData) {
    setSyncedFrom(pageData);
    setSettings(toEditable(pageData));
  }

  // Auto-save: applies the change immediately (no Save button) and persists it.
  async function persist(patch: Partial<EditableSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) setTheme(patch.theme);
    if (patch.density) applyDensity(patch.density);

    try {
      setStatus("saving");
      await apiClient.put("/settings", {
        currency: "RUB",
        demoMode: next.demoMode,
        riskProfileCode: next.riskProfileCode,
        emergencyFundMonthsTarget: String(next.emergencyFundMonthsTarget),
        theme: next.theme,
        density: next.density,
        defaultTransactionType: next.defaultTransactionType,
      });
      await reload();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (error) {
      setStatus("idle");
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    }
  }

  const selectedTheme = settings.theme;
  const selectedDensity = settings.density;

  async function loadSampleData() {
    try {
      setLoadingSample(true);
      await apiClient.post("/sample", {});
      toast.success("Демо-данные загружены.");
      await new Promise((r) => setTimeout(r, 400));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить демо-данные");
      setLoadingSample(false);
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
    <div className="grid gap-4 md:grid-cols-2">
      {/* Auto-save status — changes apply immediately, no Save button */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground md:col-span-2">
        {status === "saving" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Сохранение…
          </>
        ) : status === "saved" ? (
          <>
            <Check className="size-3.5 text-primary" />
            <span className="text-primary">Сохранено</span>
          </>
        ) : (
          "Изменения применяются и сохраняются автоматически."
        )}
      </div>

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
            <input
              name="demoMode"
              type="checkbox"
              checked={settings.demoMode}
              onChange={(e) => void persist({ demoMode: e.target.checked })}
              className="size-5 accent-primary"
            />
          </label>
          <div className="space-y-2">
            <Label>Тип операции по умолчанию</Label>
            <select
              name="defaultTransactionType"
              value={settings.defaultTransactionType}
              onChange={(e) => void persist({ defaultTransactionType: e.target.value as EditableSettings["defaultTransactionType"] })}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
            </select>
            <p className="text-xs text-muted-foreground">Выбран при открытии формы быстрого добавления.</p>
          </div>
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
            <select
              name="riskProfileCode"
              value={settings.riskProfileCode}
              onChange={(e) => void persist({ riskProfileCode: e.target.value as EditableSettings["riskProfileCode"] })}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
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
            <select
              name="emergencyFundMonthsTarget"
              value={String(settings.emergencyFundMonthsTarget)}
              onChange={(e) => void persist({ emergencyFundMonthsTarget: Number(e.target.value) })}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
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
                    onChange={() => void persist({ theme: value })}
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
                    onChange={() => void persist({ density: value })}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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
            Демо-данные заполнят приложение примером (счета, операции, бюджеты, цели), чтобы посмотреть, как всё работает. Текущие данные при этом будут заменены.
          </p>
          <Button variant="outline" type="button" className="w-full" onClick={loadSampleData} disabled={loadingSample}>
            <Sparkles className="size-4" />
            {loadingSample ? "Загрузка…" : "Загрузить демо-данные"}
          </Button>
          <p className="pt-1 text-sm text-muted-foreground">
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
    </div>
  );
}
