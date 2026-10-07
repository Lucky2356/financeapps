// Настройки, курсы валют и резервная копия документа.

import type { SettingsPageData } from "@/lib/data";
import { toFormObject } from "@/lib/api/local/helpers";
import { isSupportedCurrency, type CurrencyRates } from "@/lib/currency";
import { APP_VERSION, RISK_PROFILE_LABELS } from "@/lib/constants";
import type { LocalState } from "@/lib/api/local/state";
import { ratesOf } from "@/lib/api/local/money";
import { investmentsPage } from "@/lib/api/local/investments";

/**
 * The exported document, plus the version of the app that wrote it.
 *
 * The restore window used to show `schemaVersion` under the word "Версия",
 * and that number — 14 — is the internal shape of the data, not the release.
 * It answered a question nobody asks with an answer nobody can use. The
 * release goes in beside it; restore ignores the extra field (the state
 * schema drops what it does not declare), so older builds read these files
 * unchanged and files written before this change simply have no version to
 * show.
 */
export async function backupDocument(
  state: LocalState
): Promise<LocalState & { appVersion: string }> {
  // The AI provider key is a secret and does NOT travel with the data. A copy
  // is written to a cloud folder on a schedule and moved between devices by
  // whatever is at hand — a cable, a messenger — and a key that rides along
  // ends up wherever the file does. It is also the one thing in here nobody
  // needs restored: it belongs to the machine, not to the ledger.
  return {
    ...state,
    aiApiKey: "",
    appVersion: APP_VERSION,
    accounts: state.accounts.map((account) => ({ ...account })),
    categories: state.categories.map((category) => ({ ...category })),
    transactions: state.transactions.map((transaction) => ({ ...transaction })),
    budgets: state.budgets.map((budget) => ({ ...budget })),
    goals: state.goals.map((goal) => ({ ...goal })),
    recurringTransactions: state.recurringTransactions.map((transaction) => ({ ...transaction })),
    investments: await investmentsPage(state),
    importBatches: [...(state.importBatches ?? [])]
  };
}

export function updateSettings(state: LocalState, body: unknown) {
  // Partial update: only fields actually present in the payload are changed,
  // so a single-field save (e.g. the sidebar theme toggle sending just
  // { theme }) does not reset every other setting to its default.
  const raw = (body ?? {}) as Record<string, unknown>;
  const input = toFormObject(body);
  if (raw.demoMode !== undefined) {
    state.demoMode = raw.demoMode === true || raw.demoMode === "true" || raw.demoMode === "on";
  }
  if (input.riskProfileCode) {
    state.riskProfileCode = input.riskProfileCode as LocalState["riskProfileCode"];
  }
  if (input.currency && isSupportedCurrency(input.currency)) {
    // The app's currency is the one every total is shown in; an account keeps
    // the money it actually holds. Stamping the new currency onto every
    // account left 500 000 ₽ reading as 500 000 $, and a rate table nobody
    // was using — the totals now convert through it instead.
    state.currency = input.currency;
  }
  if (input.emergencyFundMonthsTarget !== undefined && input.emergencyFundMonthsTarget !== "") {
    state.emergencyFundMonthsTarget = Number(input.emergencyFundMonthsTarget);
  }
  if (input.theme && ["light", "dark", "system"].includes(input.theme)) {
    state.theme = input.theme as LocalState["theme"];
  }
  if (input.density && ["comfortable", "compact"].includes(input.density)) {
    state.density = input.density as LocalState["density"];
  }
  if (
    input.defaultTransactionType &&
    ["INCOME", "EXPENSE"].includes(input.defaultTransactionType)
  ) {
    state.defaultTransactionType =
      input.defaultTransactionType as LocalState["defaultTransactionType"];
  }
  if (raw.autoMaterializeRecurring !== undefined) {
    state.autoMaterializeRecurring =
      raw.autoMaterializeRecurring === true ||
      raw.autoMaterializeRecurring === "true" ||
      raw.autoMaterializeRecurring === "on";
  }
  if (raw.paymentReminders !== undefined) {
    state.paymentReminders =
      raw.paymentReminders === true ||
      raw.paymentReminders === "true" ||
      raw.paymentReminders === "on";
  }
  if (raw.aiEnabled !== undefined) {
    state.aiEnabled = raw.aiEnabled === true || raw.aiEnabled === "true" || raw.aiEnabled === "on";
  }
  if (raw.aiProvider !== undefined) {
    // Only accept a string; anything else falls back to the default provider
    // (avoids stringifying an object to "[object Object]").
    state.aiProvider =
      typeof raw.aiProvider === "string" ? raw.aiProvider.trim() || "anthropic" : "anthropic";
  }
  if (raw.aiEffort !== undefined) {
    state.aiEffort = typeof raw.aiEffort === "string" ? raw.aiEffort.trim() || "medium" : "medium";
  }
  if (raw.aiApiKey !== undefined) {
    state.aiApiKey = String(raw.aiApiKey ?? "").trim();
  }
  if (raw.aiModel !== undefined) {
    state.aiModel = String(raw.aiModel ?? "").trim();
  }
  return settingsPage(state);
}

// Merges a fresh FX table (RUB per unit, fetched client-side from the CBR feed)
// into the cached rates. Only positive finite rates for supported currencies
// are accepted; RUB stays pinned to 1. Records the refresh time so the UI can
// show how fresh the numbers are.
export function updateFxRates(
  state: LocalState,
  body: unknown
): { updatedAt: string; rates: CurrencyRates } {
  const incoming = (body as { rates?: Record<string, unknown> } | undefined)?.rates ?? {};
  const next: CurrencyRates = { ...ratesOf(state), RUB: 1 };
  for (const [code, value] of Object.entries(incoming)) {
    if (!isSupportedCurrency(code) || code === "RUB") continue;
    const rate = Number(value);
    if (Number.isFinite(rate) && rate > 0) next[code] = rate;
  }
  state.currencyRates = next;
  state.currencyRatesUpdatedAt = new Date().toISOString();
  return { updatedAt: state.currencyRatesUpdatedAt, rates: next };
}

export function settingsPage(state: LocalState): SettingsPageData {
  return {
    source: "database",
    currency: state.currency,
    demoMode: state.demoMode,
    emergencyFundMonthsTarget: state.emergencyFundMonthsTarget,
    riskProfileCode: state.riskProfileCode,
    theme: state.theme ?? "system",
    density: state.density ?? "comfortable",
    defaultTransactionType: state.defaultTransactionType ?? "EXPENSE",
    autoMaterializeRecurring: state.autoMaterializeRecurring ?? false,
    paymentReminders: state.paymentReminders ?? false,
    aiEnabled: state.aiEnabled ?? false,
    aiProvider: state.aiProvider ?? "anthropic",
    aiEffort: state.aiEffort ?? "medium",
    aiApiKey: state.aiApiKey ?? "",
    aiModel: state.aiModel ?? "",
    currencyRatesUpdatedAt: state.currencyRatesUpdatedAt ?? null,
    riskProfiles: [
      {
        id: "risk-conservative",
        code: "CONSERVATIVE",
        title: RISK_PROFILE_LABELS.CONSERVATIVE,
        description: "Стабильность и контроль просадки."
      },
      {
        id: "risk-moderate",
        code: "MODERATE",
        title: RISK_PROFILE_LABELS.MODERATE,
        description: "Баланс роста и риска."
      },
      {
        id: "risk-aggressive",
        code: "AGGRESSIVE",
        title: RISK_PROFILE_LABELS.AGGRESSIVE,
        description: "Готовность к заметной волатильности."
      }
    ]
  };
}
