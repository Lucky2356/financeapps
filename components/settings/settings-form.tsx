"use client";

import {
  Check,
  Database,
  Download,
  GraduationCap,
  Info,
  Keyboard,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Repeat,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  type LucideIcon
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { applyDensity } from "@/components/app-settings-sync";
import { AccountSection } from "@/components/settings/account-section";
import { LocalModePanel } from "@/components/settings/local-mode-panel";
import { FINANCE_TERM_HINTS, InfoHint } from "@/components/info-hint";
import type { SettingsPageData } from "@/lib/data";
import { ONBOARDING_REPLAY_EVENT, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { AI_MODELS } from "@/lib/ai/models";
import { APP_VERSION, RISK_PROFILE_LABELS } from "@/lib/constants";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const shortcuts = [
  { keys: "Alt+N", label: "Быстро добавить операцию" },
  { keys: "Alt+T", label: "Перейти к операциям" },
  { keys: "Alt+D", label: "Перейти на главную" },
  { keys: "Alt+A", label: "Перейти к аналитике" },
  { keys: "?", label: "Показать эту справку" }
];

type EditableSettings = {
  currency: CurrencyCode;
  demoMode: boolean;
  riskProfileCode: SettingsPageData["riskProfileCode"];
  emergencyFundMonthsTarget: number;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  defaultTransactionType: "INCOME" | "EXPENSE";
  autoMaterializeRecurring: boolean;
  paymentReminders: boolean;
  aiEnabled: boolean;
  aiApiKey: string;
  aiModel: string;
};

function toEditable(data: SettingsPageData): EditableSettings {
  return {
    currency: (data.currency as CurrencyCode) ?? "RUB",
    demoMode: data.demoMode,
    riskProfileCode: data.riskProfileCode,
    emergencyFundMonthsTarget: data.emergencyFundMonthsTarget,
    theme: data.theme ?? "system",
    density: data.density ?? "comfortable",
    defaultTransactionType: data.defaultTransactionType,
    autoMaterializeRecurring: data.autoMaterializeRecurring ?? false,
    paymentReminders: data.paymentReminders ?? false,
    aiEnabled: data.aiEnabled ?? false,
    aiApiKey: data.aiApiKey ?? "",
    aiModel: data.aiModel ?? ""
  };
}

const RELEASES_URL = "https://github.com/Lucky2356/financeapps/releases/latest";

type Section = { id: string; label: string; icon: LucideIcon; keywords: string; node: React.ReactNode };

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const { setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const confirm = useConfirm();
  const { data: pageData, reload } = useApiPageData(data, "/settings");
  const [clearing, setClearing] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [settings, setSettings] = useState<EditableSettings>(() => toEditable(pageData));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [activeId, setActiveId] = useState("general");
  const [query, setQuery] = useState("");

  // Re-sync controlled fields whenever fresh data arrives (e.g. the real values
  // load from IndexedDB after mount, or a save round-trips through reload()).
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
        currency: next.currency,
        demoMode: next.demoMode,
        riskProfileCode: next.riskProfileCode,
        emergencyFundMonthsTarget: String(next.emergencyFundMonthsTarget),
        theme: next.theme,
        density: next.density,
        defaultTransactionType: next.defaultTransactionType,
        autoMaterializeRecurring: next.autoMaterializeRecurring,
        paymentReminders: next.paymentReminders,
        aiEnabled: next.aiEnabled,
        aiApiKey: next.aiApiKey,
        aiModel: next.aiModel
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
      await new Promise((r) => setTimeout(r, 600));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось очистить данные");
      setClearing(false);
    }
  }

  // Built-in updater (plan D4). In a signed desktop build the Tauri updater
  // checks GitHub for a newer release and installs it in place; otherwise the
  // button opens the releases page.
  async function checkForUpdates() {
    if (!isLocalDesktopMode) {
      window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      setCheckingUpdate(true);
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        toast.success("У вас актуальная версия.");
        return;
      }
      const confirmed = await confirm({
        title: `Доступно обновление ${update.version}`,
        description: update.body
          ? `${update.body}\n\nСкачать и установить сейчас? Приложение перезапустится.`
          : "Скачать и установить сейчас? Приложение перезапустится.",
        confirmLabel: "Обновить"
      });
      if (!confirmed) return;
      toast.info("Загрузка обновления…");
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      toast.message("Автообновление недоступно — открываю страницу релизов.");
      window.open(RELEASES_URL, "_blank", "noopener,noreferrer");
    } finally {
      setCheckingUpdate(false);
    }
  }

  function replayOnboarding() {
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
      toast.success("Обучение открыто.");
    } catch {
      toast.error("Не удалось открыть обучение");
    }
  }

  // ── Section definitions ─────────────────────────────────────────────
  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [];

    list.push({
      id: "general",
      label: "Основные",
      icon: SlidersHorizontal,
      keywords: "валюта currency демо тип операции по умолчанию доход расход",
      node: (
        <SectionCard title="Основные настройки" fields>
          <div className="space-y-2">
            <Label>Валюта</Label>
            <select
              name="currency"
              value={settings.currency}
              onChange={(e) => void persist({ currency: e.target.value as CurrencyCode })}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {SUPPORTED_CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Валюта отображения для всего приложения. Суммы не пересчитываются — меняется только
              обозначение валюты.
            </p>
          </div>
          <ToggleRow
            title="Режим демо-данных"
            description="Показывает встроенный пример, когда у вас ещё нет своих данных."
            checked={settings.demoMode}
            onChange={(v) => void persist({ demoMode: v })}
          />
          <div className="space-y-2">
            <Label>Тип операции по умолчанию</Label>
            <select
              name="defaultTransactionType"
              value={settings.defaultTransactionType}
              onChange={(e) =>
                void persist({
                  defaultTransactionType: e.target
                    .value as EditableSettings["defaultTransactionType"]
                })
              }
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Выбран при открытии формы быстрого добавления.
            </p>
          </div>
        </SectionCard>
      )
    });

    list.push({
      id: "automation",
      label: "Автоматизация",
      icon: Repeat,
      keywords: "авто-проведение регулярные напоминания платежи уведомления",
      node: (
        <SectionCard title="Автоматизация" fields>
          <ToggleRow
            title="Авто-проведение регулярных"
            description="При запуске автоматически создавать просроченные плановые платежи."
            checked={settings.autoMaterializeRecurring}
            onChange={(v) => void persist({ autoMaterializeRecurring: v })}
          />
          <ToggleRow
            title="Напоминания о платежах"
            description="Системные уведомления о платежах, которые нужно провести сегодня."
            checked={settings.paymentReminders}
            onChange={(v) => void persist({ paymentReminders: v })}
          />
        </SectionCard>
      )
    });

    list.push({
      id: "appearance",
      label: "Внешний вид",
      icon: Palette,
      keywords: "тема оформление светлая тёмная системная плотность язык language русский english",
      node: (
        <SectionCard title="Внешний вид" fields>
          <div className="space-y-2">
            <Label>Тема оформления</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "light", label: "Светлая", icon: Sun },
                  { value: "system", label: "Системная", icon: Monitor },
                  { value: "dark", label: "Тёмная", icon: Moon }
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm transition-colors hover:bg-muted/40",
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
              {(
                [
                  { value: "comfortable", label: "Комфортная" },
                  { value: "compact", label: "Компактная" }
                ] as const
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40",
                    selectedDensity === value &&
                      "border-primary bg-primary/8 font-medium text-primary"
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
          <div className="space-y-2">
            <Label>{t("settings.language.title")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "ru", label: t("settings.language.ru") },
                  { value: "en", label: t("settings.language.en") }
                ] as const
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40",
                    locale === value && "border-primary bg-primary/8 font-medium text-primary"
                  )}
                >
                  <input
                    type="radio"
                    name="locale"
                    value={value}
                    checked={locale === value}
                    onChange={() => setLocale(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.language.hint")}</p>
          </div>
        </SectionCard>
      )
    });

    list.push({
      id: "ai",
      label: "ИИ-ассистент",
      icon: Sparkles,
      keywords: "ии ai claude ассистент ключ api модель",
      node: (
        <SectionCard title="ИИ-ассистент" icon={Sparkles}>
          <ToggleRow
            title="Включить ИИ-ассистент"
            description="Ввод операций текстом на странице «Операции» через Claude."
            checked={settings.aiEnabled}
            onChange={(v) => void persist({ aiEnabled: v })}
          />
          {settings.aiEnabled && (
            <>
              {isLocalDesktopMode && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ai-key">API-ключ Anthropic</Label>
                    <Input
                      id="ai-key"
                      type="password"
                      autoComplete="off"
                      value={settings.aiApiKey}
                      onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
                      onBlur={(e) => void persist({ aiApiKey: e.target.value.trim() })}
                      placeholder="sk-ant-..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Ключ хранится только на вашем устройстве и используется для запросов к
                      Anthropic.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ai-model">Модель</Label>
                    <select
                      id="ai-model"
                      value={settings.aiModel}
                      onChange={(e) => void persist({ aiModel: e.target.value })}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">По умолчанию (Opus 4.8)</option>
                      {AI_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Более мощные модели точнее, но дороже и медленнее. Для коротких фраз достаточно
                      Haiku или Sonnet.
                    </p>
                  </div>
                </>
              )}
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                Текст, который вы вводите, отправляется во внешний сервис Anthropic. Не указывайте
                конфиденциальные данные. Функцию можно отключить в любой момент.
                {!isLocalDesktopMode &&
                  " На сайте используется серверный ключ — если ИИ не настроен на сервере, запрос вернёт ошибку."}
              </div>
            </>
          )}
        </SectionCard>
      )
    });

    list.push({
      id: "risk",
      label: "Риск и подушка",
      icon: ShieldCheck,
      keywords: "риск профиль подушка резерв emergency fund инвестиции",
      node: (
        <SectionCard title="Риск и финансовая подушка" fields>
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1">
              Риск-профиль <InfoHint text={FINANCE_TERM_HINTS["Риск-профиль"]} />
            </Label>
            <select
              name="riskProfileCode"
              value={settings.riskProfileCode}
              onChange={(e) =>
                void persist({
                  riskProfileCode: e.target.value as EditableSettings["riskProfileCode"]
                })
              }
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
            <Label className="inline-flex items-center gap-1">
              Цель финансовой подушки <InfoHint text={FINANCE_TERM_HINTS["Финансовая подушка"]} />
            </Label>
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
        </SectionCard>
      )
    });

    // Account (web only): change password / delete account.
    if (!isLocalDesktopMode) {
      list.push({
        id: "account",
        label: "Аккаунт",
        icon: KeyRound,
        keywords: "аккаунт пароль сменить удалить безопасность выход",
        node: <AccountSection />
      });
    }

    list.push({
      id: "data",
      label: "Данные",
      icon: Database,
      keywords: "демо данные очистить backup резервная копия снимок local",
      node: (
        <>
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Управление данными</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Демо-данные заполнят приложение примером (счета, операции, бюджеты, цели), чтобы
                посмотреть, как всё работает. Текущие данные при этом будут заменены.
              </p>
              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={loadSampleData}
                disabled={loadingSample}
              >
                <Sparkles className="size-4" />
                {loadingSample ? "Загрузка…" : "Загрузить демо-данные"}
              </Button>
              <p className="pt-1 text-sm text-muted-foreground">
                Очистка удалит все счета, операции, цели, бюджеты и настройки. Это действие
                необратимо.
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
                      Все ваши операции, счета, цели, бюджеты, плановые платежи, портфель и настройки
                      будут безвозвратно удалены. Резервную копию можно сохранить на странице Импорт.
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
          {/* Desktop-only local snapshot tool (self-hides on web). */}
          <LocalModePanel />
        </>
      )
    });

    list.push({
      id: "about",
      label: "О приложении",
      icon: Info,
      keywords: "версия обновления горячие клавиши обучение безопасность интеграции банк",
      node: (
        <div className="space-y-4">
          <SectionCard title="Горячие клавиши" icon={Keyboard}>
            <div className="grid gap-2">
              {shortcuts.map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{s.keys}</kbd>
                </div>
              ))}
            </div>
            <Button variant="outline" type="button" className="mt-4 w-full" onClick={replayOnboarding}>
              <GraduationCap className="size-4" />
              Показать обучение снова
            </Button>
            <Button
              variant="outline"
              type="button"
              className="mt-2 w-full"
              onClick={() => void checkForUpdates()}
              disabled={checkingUpdate}
            >
              <Download className="size-4" />
              {checkingUpdate ? "Проверка…" : "Проверить обновления"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Финансовый помощник&nbsp;·&nbsp;версия {APP_VERSION}
            </p>
          </SectionCard>
          <SectionCard title="Безопасность и интеграции" icon={ShieldCheck}>
            <p className="text-sm text-muted-foreground">
              Приложение не хранит банковские логины и пароли и не выполняет screen scraping банков.
            </p>
            <p className="text-sm text-muted-foreground">
              Будущие банковские интеграции должны использовать официальные API, явное согласие
              пользователя и encrypted/secure storage для токенов.
            </p>
          </SectionCard>
        </div>
      )
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, pageData, status, locale, loadingSample, clearing, checkingUpdate]);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = trimmedQuery
    ? sections.filter(
        (s) =>
          s.label.toLowerCase().includes(trimmedQuery) ||
          s.keywords.toLowerCase().includes(trimmedQuery)
      )
    : [];
  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const visible = trimmedQuery ? matches : active ? [active] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по настройкам…"
            className="pl-9"
            aria-label="Поиск по настройкам"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Section nav: vertical on desktop, horizontal scroll on mobile. */}
        <nav
          aria-label="Разделы настроек"
          className={cn(
            "flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0",
            trimmedQuery && "pointer-events-none opacity-50"
          )}
        >
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = !trimmedQuery && s.id === active?.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveId(s.id);
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors lg:w-full",
                  isActive
                    ? "border-primary/30 bg-primary/10 font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          {visible.length === 0 ? (
            <p className="rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Ничего не найдено по запросу «{query}».
            </p>
          ) : (
            visible.map((s) => <div key={s.id}>{s.node}</div>)
          )}
        </div>
      </div>
    </div>
  );
}

// Compact reusable card wrapper for a settings section. `fields` lays the
// controls out in a responsive 2-column grid so wide screens are used well
// instead of stretching a single control across the whole width.
function SectionCard({
  title,
  icon: Icon,
  fields,
  children
}: {
  title: string;
  icon?: LucideIcon;
  fields?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={Icon ? "flex items-center gap-2" : undefined}>
          {Icon ? <Icon className="size-4" /> : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={fields ? "grid items-start gap-4 lg:grid-cols-2" : "space-y-4"}
      >
        {children}
      </CardContent>
    </Card>
  );
}

// Reusable labelled toggle row.
function ToggleRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted/30">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-primary"
      />
    </label>
  );
}
