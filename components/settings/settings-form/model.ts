import type { LucideIcon } from "lucide-react";

import type { useI18n } from "@/lib/i18n/context";
import type { SettingsPageData } from "@/lib/data";
import type { CurrencyCode } from "@/lib/currency";
import { updateTeaser } from "@/lib/updates/latest";

/** «Что нового: …» одной строкой над вопросом «Скачать и установить?». */
export function withTeaser(notes: string | undefined, question: string): string {
  const teaser = updateTeaser(notes);
  return teaser ? `${teaser}\n\n${question}` : question;
}

export const shortcuts = [
  { keys: "Alt+N", labelKey: "set.shortcut.add" },
  { keys: "Alt+T", labelKey: "set.shortcut.transactions" },
  { keys: "Alt+D", labelKey: "set.shortcut.home" },
  { keys: "Alt+A", labelKey: "set.shortcut.analytics" },
  { keys: "?", labelKey: "set.shortcut.help" }
];

export type EditableSettings = {
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

export function toEditable(data: SettingsPageData): EditableSettings {
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

/** Автосохранение настройки: применить сразу и записать (см. useEditableSettings). */
export type Persist = (patch: Partial<EditableSettings>) => Promise<void>;

/** Перевод строки по ключу — тот же `t`, что отдаёт useI18n. */
export type Translate = ReturnType<typeof useI18n>["t"];

/** Подписка-пустышка: платформа за время жизни страницы не меняется. */
export const noSubscribe = () => () => undefined;

export const RELEASES_URL = "https://github.com/Lucky2356/financeapps/releases/latest";

export type Section = {
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
export const MOVED_SECTIONS: Record<string, string> = {
  appearance: "general",
  automation: "finance",
  risk: "finance",
  account: "security"
};
