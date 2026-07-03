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
import { TwoFactorSection } from "@/components/settings/two-factor-section";
import { FINANCE_TERM_HINTS, InfoHint } from "@/components/info-hint";
import type { SettingsPageData } from "@/lib/data";
import { ONBOARDING_REPLAY_EVENT, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { AI_PROVIDERS, providerInfo, type AiProvider } from "@/lib/ai/models";
import { APP_VERSION } from "@/lib/constants";
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
import {
  ALL_OPTION,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const shortcuts = [
  { keys: "Alt+N", labelKey: "set.shortcut.add" },
  { keys: "Alt+T", labelKey: "set.shortcut.transactions" },
  { keys: "Alt+D", labelKey: "set.shortcut.home" },
  { keys: "Alt+A", labelKey: "set.shortcut.analytics" },
  { keys: "?", labelKey: "set.shortcut.help" }
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
  aiProvider: string;
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
    aiProvider: data.aiProvider ?? "anthropic",
    aiApiKey: data.aiApiKey ?? "",
    aiModel: data.aiModel ?? ""
  };
}

const RELEASES_URL = "https://github.com/Lucky2356/financeapps/releases/latest";

type Section = {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords: string;
  node: React.ReactNode;
};

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
        aiProvider: next.aiProvider,
        aiApiKey: next.aiApiKey,
        aiModel: next.aiModel
      });
      await reload();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (error) {
      setStatus("idle");
      toast.error(error instanceof Error ? error.message : t("set.saveError"));
    }
  }

  const selectedTheme = settings.theme;
  const selectedDensity = settings.density;

  async function loadSampleData() {
    try {
      setLoadingSample(true);
      await apiClient.post("/sample", {});
      toast.success(t("set.toast.sampleLoaded"));
      await new Promise((r) => setTimeout(r, 400));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.toast.sampleError"));
      setLoadingSample(false);
    }
  }

  async function clearAllData() {
    try {
      setClearing(true);
      await apiClient.delete("/storage/clear");
      toast.success(t("set.toast.cleared"));
      await new Promise((r) => setTimeout(r, 600));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.toast.clearError"));
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
        toast.success(t("set.update.current"));
        return;
      }
      const confirmed = await confirm({
        title: t("set.update.available", { version: update.version }),
        description: update.body
          ? `${update.body}\n\n${t("set.update.downloadConfirm")}`
          : t("set.update.downloadConfirm"),
        confirmLabel: t("set.update.confirmLabel")
      });
      if (!confirmed) return;
      toast.info(t("set.update.downloading"));
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      // Log the real reason (visible in desktop devtools) instead of swallowing
      // it, then open the releases page via the opener plugin — window.open is
      // blocked by the desktop webview CSP, so it silently did nothing before.
      console.error("[updater]", error);
      toast.message(t("set.update.unavailable"));
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(RELEASES_URL);
      } catch {
        /* opener unavailable (e.g. plain local build) — nothing more to do */
      }
    } finally {
      setCheckingUpdate(false);
    }
  }

  function replayOnboarding() {
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
      toast.success(t("set.toast.onboardingOpened"));
    } catch {
      toast.error(t("set.toast.onboardingError"));
    }
  }

  // ── Section definitions ─────────────────────────────────────────────
  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [];

    list.push({
      id: "general",
      label: t("set.section.general"),
      icon: SlidersHorizontal,
      keywords:
        "основные general валюта currency демо demo тип type операции transaction доход income расход expense по умолчанию default",
      node: (
        <SectionCard title={t("set.general.title")} fields>
          <div className="space-y-2">
            <Label>{t("set.currency")}</Label>
            <Select
              value={settings.currency}
              onValueChange={(value) => void persist({ currency: value as CurrencyCode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.code} — {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("set.currency.hint")}</p>
          </div>
          <ToggleRow
            title={t("set.demo.title")}
            description={t("set.demo.desc")}
            checked={settings.demoMode}
            onChange={(v) => void persist({ demoMode: v })}
          />
          <div className="space-y-2">
            <Label>{t("set.defaultType")}</Label>
            <Select
              value={settings.defaultTransactionType}
              onValueChange={(value) =>
                void persist({
                  defaultTransactionType: value as EditableSettings["defaultTransactionType"]
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">{t("set.type.expense")}</SelectItem>
                <SelectItem value="INCOME">{t("set.type.income")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("set.defaultType.hint")}</p>
          </div>
        </SectionCard>
      )
    });

    list.push({
      id: "automation",
      label: t("set.section.automation"),
      icon: Repeat,
      keywords:
        "автоматизация automation авто-проведение регулярные recurring напоминания reminders платежи payments уведомления notifications",
      node: (
        <SectionCard title={t("set.automation.title")} fields>
          <ToggleRow
            title={t("set.autoMaterialize.title")}
            description={t("set.autoMaterialize.desc")}
            checked={settings.autoMaterializeRecurring}
            onChange={(v) => void persist({ autoMaterializeRecurring: v })}
          />
          <ToggleRow
            title={t("set.reminders.title")}
            description={t("set.reminders.desc")}
            checked={settings.paymentReminders}
            onChange={(v) => void persist({ paymentReminders: v })}
          />
        </SectionCard>
      )
    });

    list.push({
      id: "appearance",
      label: t("set.section.appearance"),
      icon: Palette,
      keywords:
        "внешний вид appearance тема theme оформление светлая light тёмная dark системная system плотность density язык language русский english",
      node: (
        <SectionCard title={t("set.appearance.title")} fields>
          <div className="space-y-2">
            <Label>{t("set.theme")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "light", label: t("set.theme.light"), icon: Sun },
                  { value: "system", label: t("set.theme.system"), icon: Monitor },
                  { value: "dark", label: t("set.theme.dark"), icon: Moon }
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm transition-colors hover:bg-muted/40",
                    selectedTheme === value &&
                      "border-primary bg-primary/8 font-medium text-primary"
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
            <Label>{t("set.density")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "comfortable", label: t("set.density.comfortable") },
                  { value: "compact", label: t("set.density.compact") }
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
      label: t("set.section.ai"),
      icon: Sparkles,
      keywords: "ии ai claude ассистент assistant ключ key api модель model",
      node: (
        <SectionCard title={t("set.ai.title")} icon={Sparkles}>
          <ToggleRow
            title={t("set.ai.enable.title")}
            description={t("set.ai.enable.desc")}
            checked={settings.aiEnabled}
            onChange={(v) => void persist({ aiEnabled: v })}
          />
          {settings.aiEnabled && (
            <>
              {isLocalDesktopMode &&
                (() => {
                  const activeProvider = providerInfo(settings.aiProvider);
                  return (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="ai-provider">{t("set.ai.provider")}</Label>
                        <Select
                          value={activeProvider.id}
                          onValueChange={(value) => {
                            // Switching provider resets the model to that
                            // provider's default (empty = its default model).
                            void persist({ aiProvider: value as AiProvider, aiModel: "" });
                          }}
                        >
                          <SelectTrigger id="ai-provider">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_PROVIDERS.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t("set.ai.provider.hint")}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-key">{t("set.ai.key")}</Label>
                        <Input
                          id="ai-key"
                          type="password"
                          autoComplete="off"
                          value={settings.aiApiKey}
                          onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
                          onBlur={(e) => void persist({ aiApiKey: e.target.value.trim() })}
                          placeholder={activeProvider.id === "anthropic" ? "sk-ant-..." : "sk-..."}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t(activeProvider.keyHintKey)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-model">{t("set.ai.model")}</Label>
                        <Select
                          value={settings.aiModel || ALL_OPTION}
                          onValueChange={(value) =>
                            void persist({ aiModel: value === ALL_OPTION ? "" : value })
                          }
                        >
                          <SelectTrigger id="ai-model">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ALL_OPTION}>{t("set.ai.model.default")}</SelectItem>
                            {activeProvider.models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t("set.ai.model.hint")}</p>
                      </div>
                    </>
                  );
                })()}
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                {t("set.ai.warning")}
                {!isLocalDesktopMode && t("set.ai.warning.web")}
              </div>
            </>
          )}
        </SectionCard>
      )
    });

    list.push({
      id: "risk",
      label: t("set.section.risk"),
      icon: ShieldCheck,
      keywords:
        "риск risk профиль profile подушка cushion резерв reserve emergency fund инвестиции investments",
      node: (
        <SectionCard title={t("set.risk.title")} fields>
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1">
              {t("set.risk.profile")} <InfoHint text={FINANCE_TERM_HINTS["Риск-профиль"]} />
            </Label>
            <Select
              value={settings.riskProfileCode}
              onValueChange={(value) =>
                void persist({
                  riskProfileCode: value as EditableSettings["riskProfileCode"]
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageData.riskProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.code}>
                    {t(`riskProfile.${profile.code}`)} — {t(`riskProfile.${profile.code}.desc`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("set.risk.profile.hint")}</p>
          </div>
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1">
              {t("set.risk.fund")} <InfoHint text={FINANCE_TERM_HINTS["Финансовая подушка"]} />
            </Label>
            <Select
              value={String(settings.emergencyFundMonthsTarget)}
              onValueChange={(value) => void persist({ emergencyFundMonthsTarget: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">{t("set.risk.fund.months", { n: 3 })}</SelectItem>
                <SelectItem value="6">{t("set.risk.fund.months12", { n: 6 })}</SelectItem>
                <SelectItem value="12">{t("set.risk.fund.months12", { n: 12 })}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("set.risk.fund.hint")}</p>
          </div>
        </SectionCard>
      )
    });

    // Account (web only): change password / delete account.
    if (!isLocalDesktopMode) {
      list.push({
        id: "account",
        label: t("set.section.account"),
        icon: KeyRound,
        keywords:
          "аккаунт account пароль password сменить change удалить delete безопасность security выход logout 2fa двухфакторная two-factor totp",
        node: (
          <div className="space-y-5">
            <AccountSection />
            <TwoFactorSection />
          </div>
        )
      });
    }

    list.push({
      id: "data",
      label: t("set.section.data"),
      icon: Database,
      keywords: "данные data демо demo очистить clear backup резервная копия снимок snapshot local",
      node: (
        <>
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">{t("set.data.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("set.data.sampleHint")}</p>
              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={loadSampleData}
                disabled={loadingSample}
              >
                <Sparkles className="size-4" />
                {loadingSample ? t("set.data.loading") : t("set.data.loadSample")}
              </Button>
              <p className="pt-1 text-sm text-muted-foreground">{t("set.data.clearHint")}</p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" type="button" className="w-full">
                    <Trash2 className="size-4" />
                    {t("set.data.clear")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("set.data.clearConfirm")}</DialogTitle>
                    <DialogDescription>{t("set.data.clearConfirmDesc")}</DialogDescription>
                  </DialogHeader>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
                    {t("set.data.clearWarning")}
                  </div>
                  <DialogFooter>
                    <Button variant="destructive" onClick={clearAllData} disabled={clearing}>
                      {clearing ? t("set.data.clearing") : t("set.data.clearYes")}
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
      label: t("set.section.about"),
      icon: Info,
      keywords:
        "о приложении about версия version обновления updates горячие клавиши shortcuts обучение onboarding безопасность security интеграции integrations банк bank",
      node: (
        <div className="space-y-4">
          <SectionCard title={t("set.about.shortcuts")} icon={Keyboard}>
            <div className="grid gap-2">
              {shortcuts.map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{t(s.labelKey)}</span>
                  <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{s.keys}</kbd>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              type="button"
              className="mt-4 w-full"
              onClick={replayOnboarding}
            >
              <GraduationCap className="size-4" />
              {t("set.about.replayOnboarding")}
            </Button>
            <Button
              variant="outline"
              type="button"
              className="mt-2 w-full"
              onClick={() => void checkForUpdates()}
              disabled={checkingUpdate}
            >
              <Download className="size-4" />
              {checkingUpdate ? t("set.about.checking") : t("set.about.checkUpdates")}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("set.about.version", { version: APP_VERSION })}
            </p>
          </SectionCard>
          <SectionCard title={t("set.about.security")} icon={ShieldCheck}>
            <p className="text-sm text-muted-foreground">{t("set.about.securityText1")}</p>
            <p className="text-sm text-muted-foreground">{t("set.about.securityText2")}</p>
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
              {t("set.saving")}
            </>
          ) : status === "saved" ? (
            <>
              <Check className="size-3.5 text-primary" />
              <span className="text-primary">{t("set.saved")}</span>
            </>
          ) : (
            t("set.autosaveHint")
          )}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("set.search")}
            className="pl-9"
            aria-label={t("set.search")}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Section nav: vertical on desktop, horizontal scroll on mobile. */}
        <nav
          aria-label={t("set.sections")}
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
              {t("set.nothingFound", { query })}
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
      <CardContent className={fields ? "grid items-start gap-4 lg:grid-cols-2" : "space-y-4"}>
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
