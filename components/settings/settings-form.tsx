"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  GraduationCap,
  Info,
  Loader2,
  PiggyBank,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  type LucideIcon
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { isAndroidShell } from "@/lib/platform/device";
import { applyDensity } from "@/components/app-settings-sync";
import { AutoBackupPanel, CloudSyncPanel } from "@/components/settings/cloud-sync-panel";
import { PeoplePanel } from "@/components/settings/people-panel";
import { SyncPanel } from "@/components/sync/sync-panel";
import { VaultPanel } from "@/components/settings/vault-panel";
import { ImportExportPanel } from "@/components/import/import-export-panel";
import { InfoHint } from "@/components/info-hint";
import type { AccountsPageData, ImportPageData, SettingsPageData } from "@/lib/data";
import { ONBOARDING_REPLAY_EVENT, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { AI_EFFORTS, AI_PROVIDERS, providerInfo, type AiProvider } from "@/lib/ai/models";
import { APP_VERSION } from "@/lib/constants";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
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
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import {
  ALL_OPTION,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { markThemeChosen } from "@/lib/theme-preference";
import { cn } from "@/lib/utils";
import { useIncludeTransfers } from "@/hooks/use-include-transfers";
import {
  DEFAULT_ACCOUNT_KEY,
  forgetMyData,
  readMine,
  removeMine,
  writeMine
} from "@/lib/storage/mine";
import {
  START_SCREENS,
  areAmountsHidden,
  areKopecksShown,
  readStartScreen,
  readTextSize,
  setAmountsHidden,
  setKopecksShown,
  setStartScreen,
  setTextSize,
  type StartScreen,
  type TextSize
} from "@/lib/preferences";

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
  aiEffort: string;
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
    aiEffort: data.aiEffort ?? "medium",
    aiApiKey: data.aiApiKey ?? "",
    aiModel: data.aiModel ?? ""
  };
}

/** Подписка-пустышка: платформа за время жизни страницы не меняется. */
const noSubscribe = () => () => undefined;

const RELEASES_URL = "https://github.com/Lucky2356/financeapps/releases/latest";

type Section = {
  id: string;
  label: string;
  /** Что внутри — строкой под названием в списке разделов. */
  summary: string;
  /** О чём раздел — под заголовком открытого раздела. */
  lead: string;
  icon: LucideIcon;
  keywords: string;
  node: React.ReactNode;
};

/**
 * Разделы, которых больше нет, — и куда их содержимое переехало. Старые
 * ссылки (закладки, прежние выпуски памяток) ведут в нужное место, а не на
 * пустой экран.
 */
const MOVED_SECTIONS: Record<string, string> = {
  appearance: "general",
  automation: "finance",
  risk: "finance",
  account: "security"
};

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const { setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const confirm = useConfirm();
  const { data: pageData, reload } = useApiPageData(data, "/settings");
  const [clearing, setClearing] = useState(false);
  const [homeTransfers, setHomeTransfers] = useIncludeTransfers("home");
  const [loadingSample, setLoadingSample] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [settings, setSettings] = useState<EditableSettings>(() => toEditable(pageData));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const router = useRouter();
  // Открытый раздел живёт в адресе (?section=data), а не в состоянии экрана.
  // Так ссылка «Данные» из меню открывает нужный раздел, а кнопка «назад» на
  // телефоне возвращает к списку разделов, а не уводит с настроек вовсе.
  const requestedSection = useSearchParams().get("section");
  const chosen = requestedSection ? (MOVED_SECTIONS[requestedSection] ?? requestedSection) : null;
  const activeId = chosen ?? "general";
  const [query, setQuery] = useState("");
  // Житейские настройки этого устройства (lib/preferences.ts). Скрытые суммы и
  // копейки перерисовывают экраны сами — через событие, — поэтому здесь их
  // достаточно прочитать; остальные три помнятся тут же.
  const [textSize, setTextSizeState] = useState<TextSize>(readTextSize);
  const [startScreen, setStartScreenState] = useState<StartScreen>(readStartScreen);
  const [defaultAccount, setDefaultAccount] = useState(() => readMine(DEFAULT_ACCOUNT_KEY) ?? "");
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  useEffect(() => {
    let alive = true;
    apiClient
      .get<AccountsPageData>("/accounts")
      .then((page) => {
        if (alive) setAccounts(page.accounts);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // Папку на диске выбрать можно только на компьютере: у телефона такого
  // окна нет. Через внешнее хранилище, а не проверкой при отрисовке, — чтобы
  // собранная заранее страница и живая не разошлись при оживлении.
  const android = useSyncExternalStore(noSubscribe, isAndroidShell, () => false);

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
    if (patch.theme) {
      markThemeChosen();
      setTheme(patch.theme);
    }
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
        aiEffort: next.aiEffort,
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
      forgetMyData();
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
    // Android has no updater plugin, so the app reads the same release manifest
    // itself, downloads the APK in-app (with progress) and opens the system
    // installer. Only the final «Установить» is Android's.
    if (isAndroidShell()) {
      try {
        setCheckingUpdate(true);
        const { checkAndroidUpdate, installAndroidUpdate, markChecked } =
          await import("@/lib/updates/android");
        const update = await checkAndroidUpdate();
        markChecked();
        if (!update) {
          toast.success(t("set.update.current"));
          return;
        }
        const confirmed = await confirm({
          title: t("set.update.available", { version: update.version }),
          description: t("set.update.androidConfirm"),
          confirmLabel: t("set.update.confirmLabel")
        });
        if (!confirmed) return;
        // 40 МБ по мобильной сети — это не мгновенно: без процента человек
        // решит, что кнопка не сработала, и нажмёт ещё раз.
        void installAndroidUpdate(update, {
          downloading: t("set.update.downloading"),
          progress: (percent) => t("set.update.progress", { percent }),
          opening: t("set.update.opening"),
          failed: t("set.update.failed"),
          retry: t("set.update.retry")
        });
      } catch (error) {
        // A phone has no devtools, so a bare "недоступно" leaves the owner
        // (and me) with nothing to go on: the text names which source failed
        // and why. The browser stays closed — the button is right here to retry.
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[updater:android]", error);
        toast.error(t("set.update.checkFailed"), { description: detail, duration: 15_000 });
      } finally {
        setCheckingUpdate(false);
      }
      return;
    }
    try {
      setCheckingUpdate(true);
      // Same path the background check uses, retry included: one failed
      // request used to be reported as "автообновление недоступно".
      const { checkDesktopUpdate } = await import("@/lib/updates/desktop");
      const { markChecked } = await import("@/lib/updates/schedule");
      const update = await checkDesktopUpdate();
      markChecked("desktop");
      if (!update) {
        toast.success(t("set.update.current"));
        return;
      }
      const confirmed = await confirm({
        title: t("set.update.available", { version: update.version }),
        description: update.notes
          ? `${update.notes}\n\n${t("set.update.downloadConfirm")}`
          : t("set.update.downloadConfirm"),
        confirmLabel: t("set.update.confirmLabel")
      });
      if (!confirmed) return;
      toast.info(t("set.update.downloading"));
      await update.install();
    } catch (error) {
      // SHOW the real reason, do not just log it: devtools are not available in
      // a packaged build, so "обновления недоступны" on its own left no way to
      // tell a network problem from a broken manifest — which cost a whole
      // debugging round after 1.6.0.
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[updater]", error);
      toast.message(t("set.update.unavailable"), {
        description: reason,
        duration: 12_000
      });
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
      removeMine(ONBOARDING_STORAGE_KEY);
      window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
      toast.success(t("set.toast.onboardingOpened"));
    } catch {
      toast.error(t("set.toast.onboardingError"));
    }
  }

  // ── Разделы ─────────────────────────────────────────────────────────
  //
  // Семь разделов, и на экране всегда один. Прежде они шли одной лентой в
  // девять экранов телефона, и владелец сказал прямо: «чтоб человеку не нужно
  // было миллион лет листать». Раскладка по смыслу, а не по тому, в каком
  // выпуске настройка появилась: всё, что про другие устройства, — в
  // «Синхронизации», всё, что про пароль и соседей по устройству, — в «Пароле и
  // доступе», и «Данные» перестали быть свалкой из восьми карточек.
  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [];

    list.push({
      id: "general",
      label: t("set.nav.general"),
      summary: t("set.nav.general.summary"),
      lead: t("set.nav.general.lead"),
      icon: SlidersHorizontal,
      keywords:
        "основные general валюта currency язык language русский english тема theme светлая light тёмная dark системная system плотность density внешний вид appearance копейки kopecks крупный текст шрифт large text font запуск start экран screen счёт account по умолчанию default скрыть суммы hide amounts privacy",
      node: (
        <>
          <Group title={t("set.group.display")}>
            <SelectField
              id="set-currency"
              label={t("set.currency")}
              help={t("set.help.currency")}
              value={settings.currency}
              onValueChange={(value) => void persist({ currency: value as CurrencyCode })}
            >
              {SUPPORTED_CURRENCIES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.code} — {item.label}
                </SelectItem>
              ))}
            </SelectField>
            <SettingRow label={t("settings.language.title")} help={t("set.help.language")}>
              <Segmented
                ariaLabel={t("settings.language.title")}
                value={locale}
                onChange={(value) => setLocale(value)}
                options={[
                  { value: "ru", label: t("settings.language.ru") },
                  { value: "en", label: t("settings.language.en") }
                ]}
              />
            </SettingRow>
            <ToggleRow
              title={t("prefs.kopecks.title")}
              description={t("prefs.kopecks.desc")}
              help={t("prefs.kopecks.help")}
              checked={areKopecksShown()}
              onChange={setKopecksShown}
            />
          </Group>
          <Group title={t("set.group.look")}>
            <SettingRow label={t("set.theme")} help={t("set.help.theme")}>
              <Segmented
                ariaLabel={t("set.theme")}
                value={selectedTheme}
                onChange={(value) => void persist({ theme: value })}
                options={[
                  { value: "light", label: t("set.theme.light") },
                  { value: "system", label: t("set.theme.system") },
                  { value: "dark", label: t("set.theme.dark") }
                ]}
              />
            </SettingRow>
            <SettingRow label={t("set.density")} help={t("set.help.density")}>
              <Segmented
                ariaLabel={t("set.density")}
                value={selectedDensity}
                onChange={(value) => void persist({ density: value })}
                options={[
                  { value: "comfortable", label: t("set.density.comfortable") },
                  { value: "compact", label: t("set.density.compact") }
                ]}
              />
            </SettingRow>
            <SettingRow label={t("prefs.text.title")} help={t("prefs.text.help")}>
              <Segmented
                ariaLabel={t("prefs.text.title")}
                value={textSize}
                onChange={(value) => {
                  setTextSize(value);
                  setTextSizeState(value);
                }}
                options={[
                  { value: "normal", label: t("prefs.text.normal") },
                  { value: "large", label: t("prefs.text.large") }
                ]}
              />
            </SettingRow>
          </Group>
          <Group title={t("set.group.everyday")}>
            <SelectField
              id="set-start-screen"
              label={t("prefs.start.title")}
              help={t("prefs.start.help")}
              value={startScreen}
              onValueChange={(value) => {
                setStartScreen(value as StartScreen);
                setStartScreenState(value as StartScreen);
              }}
            >
              {START_SCREENS.map((screen) => (
                <SelectItem key={screen} value={screen}>
                  {t(`prefs.start.${screen === "/" ? "home" : screen.slice(1)}`)}
                </SelectItem>
              ))}
            </SelectField>
            <SettingRow label={t("prefs.type.title")} help={t("prefs.type.help")}>
              <Segmented
                ariaLabel={t("prefs.type.title")}
                value={settings.defaultTransactionType}
                onChange={(value) => void persist({ defaultTransactionType: value })}
                options={[
                  { value: "EXPENSE", label: t("prefs.type.expense") },
                  { value: "INCOME", label: t("prefs.type.income") }
                ]}
              />
            </SettingRow>
            <SelectField
              id="set-default-account"
              label={t("prefs.account.title")}
              help={t("prefs.account.help")}
              value={defaultAccount || "last"}
              onValueChange={(value) => {
                const next = value === "last" ? "" : value;
                if (next) writeMine(DEFAULT_ACCOUNT_KEY, next);
                else removeMine(DEFAULT_ACCOUNT_KEY);
                setDefaultAccount(next);
              }}
            >
              <SelectItem value="last">{t("prefs.account.last")}</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectField>
            <ToggleRow
              title={t("prefs.homeTransfers.title")}
              description={t("prefs.homeTransfers.desc")}
              help={t("prefs.homeTransfers.help")}
              checked={homeTransfers}
              onChange={setHomeTransfers}
            />
            <ToggleRow
              title={t("prefs.hide.title")}
              description={t("prefs.hide.desc")}
              help={t("prefs.hide.help")}
              checked={areAmountsHidden()}
              onChange={setAmountsHidden}
            />
          </Group>
        </>
      )
    });

    list.push({
      id: "finance",
      label: t("set.nav.finance"),
      summary: t("set.nav.finance.summary"),
      lead: t("set.nav.finance.lead"),
      icon: PiggyBank,
      keywords:
        "финансы finance регулярные recurring автоматизация automation проведение напоминания reminders платежи payments уведомления notifications риск risk профиль profile подушка cushion резерв reserve",
      node: (
        <>
          <Group title={t("set.group.recurring")}>
            <ToggleRow
              title={t("set.autoMaterialize.title")}
              description={t("set.autoMaterialize.desc")}
              help={t("set.help.autoMaterialize")}
              checked={settings.autoMaterializeRecurring}
              onChange={(v) => void persist({ autoMaterializeRecurring: v })}
            />
            <ToggleRow
              title={t("set.reminders.title")}
              description={t("set.reminders.desc")}
              help={t("set.help.reminders")}
              checked={settings.paymentReminders}
              onChange={(v) => void persist({ paymentReminders: v })}
            />
          </Group>
          <Group title={t("set.group.goals")}>
            <SelectField
              id="set-fund"
              label={t("set.risk.fund")}
              help={t("hint.cushion")}
              hint={t("set.risk.fund.hint")}
              value={String(settings.emergencyFundMonthsTarget)}
              onValueChange={(value) => void persist({ emergencyFundMonthsTarget: Number(value) })}
            >
              <SelectItem value="3">{t("set.risk.fund.months", { n: 3 })}</SelectItem>
              <SelectItem value="6">{t("set.risk.fund.months12", { n: 6 })}</SelectItem>
              <SelectItem value="12">{t("set.risk.fund.months12", { n: 12 })}</SelectItem>
            </SelectField>
            <SelectField
              id="set-risk-profile"
              label={t("set.risk.profile")}
              help={t("hint.riskProfile")}
              hint={t("set.risk.profile.hint")}
              value={settings.riskProfileCode}
              onValueChange={(value) =>
                void persist({
                  riskProfileCode: value as EditableSettings["riskProfileCode"]
                })
              }
            >
              {pageData.riskProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.code}>
                  {t(`riskProfile.${profile.code}`)} — {t(`riskProfile.${profile.code}.desc`)}
                </SelectItem>
              ))}
            </SelectField>
          </Group>
        </>
      )
    });

    list.push({
      id: "ai",
      label: t("set.nav.ai"),
      summary: t("set.nav.ai.summary"),
      lead: t("set.nav.ai.lead"),
      icon: Sparkles,
      keywords:
        "ии ai claude chatgpt deepseek ассистент помощник assistant ключ key api модель model",
      node: (
        <Group>
          <ToggleRow
            title={t("set.ai.enable.title")}
            description={t("set.ai.enable.desc")}
            help={t("set.help.ai")}
            checked={settings.aiEnabled}
            onChange={(v) => void persist({ aiEnabled: v })}
          />
          {settings.aiEnabled
            ? (() => {
                const activeProvider = providerInfo(settings.aiProvider);
                return (
                  <>
                    <SelectField
                      id="ai-provider"
                      label={t("set.ai.provider")}
                      help={t("set.help.aiProvider")}
                      value={activeProvider.id}
                      onValueChange={(value) => {
                        // Switching provider resets the model to that provider's
                        // default (empty = its default model).
                        void persist({ aiProvider: value as AiProvider, aiModel: "" });
                      }}
                    >
                      {AI_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectField>
                    <SettingRow
                      label={t("set.ai.key")}
                      help={t("set.help.aiKey")}
                      hint={t(activeProvider.keyHintKey)}
                      htmlFor="ai-key"
                      block
                    >
                      <Input
                        id="ai-key"
                        type="password"
                        autoComplete="off"
                        value={settings.aiApiKey}
                        onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
                        onBlur={(e) => void persist({ aiApiKey: e.target.value.trim() })}
                        placeholder={activeProvider.id === "anthropic" ? "sk-ant-..." : "sk-..."}
                      />
                      {/* Where the key lives, said plainly. It is stored beside
                          the ledger without encryption, and since 1.24.0 it is
                          the one thing kept OUT of the backup file — which is
                          worth knowing before moving to a second computer. */}
                      <p className="text-xs text-muted-foreground">{t("set.ai.key.storage")}</p>
                    </SettingRow>
                    <SelectField
                      id="ai-model"
                      label={t("set.ai.model")}
                      help={t("set.help.aiModel")}
                      value={settings.aiModel || ALL_OPTION}
                      onValueChange={(value) =>
                        void persist({ aiModel: value === ALL_OPTION ? "" : value })
                      }
                    >
                      <SelectItem value={ALL_OPTION}>{t("set.ai.model.default")}</SelectItem>
                      {activeProvider.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectField>
                    <SelectField
                      id="ai-effort"
                      label={t("set.ai.effort")}
                      help={t("set.help.aiEffort")}
                      value={settings.aiEffort || "medium"}
                      onValueChange={(value) => void persist({ aiEffort: value })}
                    >
                      {AI_EFFORTS.map((effort) => (
                        <SelectItem key={effort} value={effort}>
                          {t(`set.ai.effort.${effort}`)}
                        </SelectItem>
                      ))}
                    </SelectField>
                    <p className="flex gap-2 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      {t("set.ai.warning")}
                    </p>
                  </>
                );
              })()
            : null}
        </Group>
      )
    });

    list.push({
      id: "sync",
      label: t("set.nav.sync"),
      summary: t("set.nav.sync.summary"),
      lead: t("set.nav.sync.lead"),
      icon: RefreshCw,
      keywords:
        "синхронизация sync устройства devices телефон phone компьютер служба server сервер код связки pairing qr облако cloud папка folder dropbox drive",
      node: (
        <>
          <SyncPanel />
          {/* Старый способ — ручной перенос через облачную папку. Не удалён:
              им могли пользоваться. Но и на виду ему не место — рядом со
              службой он выглядел вторым равноправным путём и сбивал с толку. */}
          {android ? null : (
            <details className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm font-medium">{t("set.sync.other")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("set.sync.otherHint")}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="border-t">
                <CloudSyncPanel embedded />
              </div>
            </details>
          )}
        </>
      )
    });

    list.push({
      id: "security",
      label: t("set.nav.security"),
      summary: t("set.nav.security.summary"),
      lead: t("set.nav.security.lead"),
      icon: ShieldCheck,
      keywords:
        "пароль password доступ access замок lock код восстановления recovery люди people человек person безопасность security",
      node: (
        <>
          <VaultPanel />
          <PeoplePanel />
        </>
      )
    });

    list.push({
      id: "data",
      label: t("set.nav.data"),
      summary: t("set.nav.data.summary"),
      lead: t("set.nav.data.lead"),
      icon: Database,
      keywords:
        "данные data импорт import csv выгрузка экспорт export загрузить restore демо demo пример очистить clear удалить backup резервная копия snapshot",
      node: (
        <>
          {/* Everything that moves data in or out of the app: the copy of it,
              the CSV import and the exports. */}
          <ImportExportPanel
            data={{ source: "database", accounts: [], categories: [] } as ImportPageData}
            transactions={[]}
            afterBackup={android ? null : <AutoBackupPanel />}
          />
          <Group title={t("set.group.sample")}>
            <SettingRow
              label={t("set.data.loadSample")}
              help={t("set.help.sample")}
              hint={t("set.data.sampleHint")}
            >
              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={loadSampleData}
                disabled={loadingSample}
              >
                <Sparkles className="size-4" />
                {loadingSample ? t("set.data.loading") : t("set.data.loadSampleShort")}
              </Button>
            </SettingRow>
          </Group>
          {/* Опасное — последним и отдельно: сюда не попадают, листая. */}
          <Group title={t("set.group.danger")} danger>
            <SettingRow label={t("set.data.clear")} hint={t("set.data.clearHint")}>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" type="button" className="w-full">
                    <Trash2 className="size-4" />
                    {t("set.data.clearShort")}
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
            </SettingRow>
          </Group>
        </>
      )
    });

    list.push({
      id: "about",
      label: t("set.nav.about"),
      summary: t("set.nav.about.summary"),
      lead: t("set.nav.about.lead"),
      icon: Info,
      keywords:
        "о приложении about версия version обновления updates горячие клавиши shortcuts обучение onboarding знакомство",
      node: (
        <>
          <Group>
            <SettingRow
              label={t("set.about.versionLabel")}
              hint={t("set.about.version", { version: APP_VERSION })}
            >
              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={() => void checkForUpdates()}
                disabled={checkingUpdate}
              >
                <Download className="size-4" />
                {checkingUpdate ? t("set.about.checking") : t("set.about.checkUpdates")}
              </Button>
            </SettingRow>
            <SettingRow label={t("set.about.tour")} hint={t("set.about.tourHint")}>
              <Button variant="outline" type="button" className="w-full" onClick={replayOnboarding}>
                <GraduationCap className="size-4" />
                {t("set.about.replayOnboarding")}
              </Button>
            </SettingRow>
          </Group>
          {/* Клавиш на телефоне нет — и списка на нём тоже. */}
          <div className="hidden md:block">
            <Group title={t("set.about.shortcuts")}>
              {shortcuts.map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5"
                >
                  <span className="text-sm text-muted-foreground">{t(s.labelKey)}</span>
                  <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </Group>
          </div>
        </>
      )
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings,
    pageData,
    status,
    locale,
    loadingSample,
    clearing,
    checkingUpdate,
    android,
    textSize,
    startScreen,
    defaultAccount,
    accounts
  ]);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = trimmedQuery
    ? sections.filter(
        (s) =>
          s.label.toLowerCase().includes(trimmedQuery) ||
          s.summary.toLowerCase().includes(trimmedQuery) ||
          s.keywords.toLowerCase().includes(trimmedQuery)
      )
    : [];
  const current = sections.find((section) => section.id === activeId) ?? sections[0];

  function open(id: string) {
    setQuery("");
    router.push(`/settings?section=${id}`, { scroll: false });
    // На телефоне раздел открывается «страницей» — с её начала, а не с того
    // места, где был список.
    window.scrollTo({ top: 0 });
  }

  const statusLine = (
    <div className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      {status === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {t("set.saving")}
        </>
      ) : status === "saved" ? (
        <>
          <Check className="size-3.5 text-success" />
          <span className="text-success">{t("set.saved")}</span>
        </>
      ) : null}
    </div>
  );

  const search = (
    <div className="relative">
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
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start">
      {/* Оглавление. На компьютере — всегда слева; на телефоне — это и есть
          первый экран настроек, как в настройках самого телефона: разделы с
          пояснением «что внутри», раздел открывается касанием. */}
      <aside
        className={cn(
          "space-y-3 lg:sticky lg:top-6",
          chosen || trimmedQuery ? "hidden lg:block" : ""
        )}
      >
        {search}
        <nav
          aria-label={t("set.sections")}
          data-testid="settings-nav"
          className="overflow-hidden rounded-xl border bg-card lg:border-0 lg:bg-transparent"
        >
          <ul className="divide-y divide-border/60 lg:space-y-0.5 lg:divide-y-0">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === current.id && !trimmedQuery;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => open(section.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors lg:rounded-lg lg:py-2.5",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive ? "lg:bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors lg:size-8",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm font-medium",
                          isActive ? "lg:text-primary" : undefined
                        )}
                      >
                        {section.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {section.summary}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 lg:hidden" />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className={cn("min-w-0", chosen || trimmedQuery ? "" : "hidden lg:block")}>
        {trimmedQuery ? (
          <div className="space-y-6">
            <div className="lg:hidden">{search}</div>
            {matches.length === 0 ? (
              <p className="rounded-xl border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                {t("set.nothingFound", { query })}
              </p>
            ) : (
              matches.map((section) => (
                <SectionView key={section.id} section={section} status={null} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Назад к списку — только на телефоне: на компьютере список и так
                рядом. Ссылкой на сам экран настроек, а не history.back(): сюда
                приходят и по ссылке «Данные» из меню, и назад там был бы чужой
                экран. */}
            <button
              type="button"
              onClick={() => {
                router.push("/settings", { scroll: false });
                window.scrollTo({ top: 0 });
              }}
              className="-ml-1 inline-flex min-h-10 items-center gap-1 rounded-md px-1 text-sm text-primary lg:hidden"
            >
              <ChevronLeft className="size-4" />
              {t("set.back")}
            </button>
            <SectionView key={current.id} section={current} status={statusLine} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Один раздел: заголовок, строка «о чём он», и его группы.
 *
 * Появляется мягко — коротким проявлением со сдвигом на пару пикселей, чтобы
 * смена раздела читалась как смена, а не как мигание. Кто просил систему не
 * двигать ничего, получает раздел сразу.
 */
function SectionView({ section, status }: { section: Section; status: React.ReactNode }) {
  return (
    <section
      id={`set-${section.id}`}
      aria-labelledby={`set-${section.id}-title`}
      className="space-y-5 duration-200 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="min-w-0 space-y-1">
          <h2 id={`set-${section.id}-title`} className="text-xl font-semibold tracking-tight">
            {section.label}
          </h2>
          <p className="text-sm text-muted-foreground">{section.lead}</p>
        </div>
        {status}
      </header>
      <div className="space-y-5">{section.node}</div>
    </section>
  );
}

/**
 * Группа строк под маленьким заголовком — как в настройках телефона.
 *
 * Одна рамка на группу, строки внутри разделены волоском. Рамка означает
 * «отдельный предмет», и когда ею обведено всё подряд — карточка раздела,
 * коробка поля, сам список, — она не означает уже ничего.
 */
function Group({
  title,
  danger,
  children
}: {
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {title ? (
        <h3
          className={cn(
            "px-1 text-xs font-medium uppercase tracking-wider",
            danger ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {title}
        </h3>
      ) : null}
      <div
        className={cn(
          "divide-y divide-border/60 overflow-hidden rounded-xl border bg-card",
          danger && "border-destructive/40"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Одна настройка: слева — как она называется, «?» с объяснением простыми
 * словами и короткая строка под названием; справа — чем её меняют.
 *
 * «?» — не повтор строки под названием. Строка говорит, ЧТО делает настройка;
 * вопросик — ЗАЧЕМ она и что будет, если её тронуть. Первое нужно каждому,
 * второе — тому, кто сомневается, и незачем показывать его всем.
 *
 * `block` — для широкого управления (поле ключа): под подписью оно читается
 * лучше, чем ужатое в правую колонку.
 */
function SettingRow({
  label,
  hint,
  help,
  htmlFor,
  block,
  children
}: {
  label: React.ReactNode;
  hint?: string;
  help?: string;
  htmlFor?: string;
  block?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "gap-x-8 gap-y-3 px-4 py-4 sm:px-5",
        block ? "space-y-3" : "sm:flex sm:items-center sm:justify-between"
      )}
    >
      <div className={cn("min-w-0 space-y-1", block ? undefined : "sm:max-w-md")}>
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </Label>
          {help ? <InfoHint text={help} /> : null}
        </div>
        {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn("min-w-0", block ? "space-y-2" : "mt-3 sm:mt-0 sm:w-[22rem] sm:shrink-0")}>
        {children}
      </div>
    </div>
  );
}

// A setting that is chosen from a list: a label, a select, the options, and a
// line of explanation. One component, so the call sites carry only what
// actually differs.
function SelectField({
  id,
  label,
  value,
  onValueChange,
  hint,
  help,
  children
}: {
  id?: string;
  label: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <SettingRow label={label} hint={hint} help={help} htmlFor={id}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </SettingRow>
  );
}

/**
 * Строка-переключатель.
 *
 * Нажимаются и название, и строка под ним, а не только квадратик в дальнем
 * углу: на телефоне до квадратика ещё надо дотянуться. Вопросик стоит вне
 * подписей — нажатие на него открывает объяснение и не щёлкает переключателем.
 */
function ToggleRow({
  title,
  description,
  help,
  checked,
  onChange
}: {
  title: string;
  description: string;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="cursor-pointer text-sm font-medium">
            {title}
          </label>
          {help ? <InfoHint text={help} /> : null}
        </div>
        <label
          htmlFor={id}
          className="block cursor-pointer text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </label>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} aria-label={title} />
    </div>
  );
}
