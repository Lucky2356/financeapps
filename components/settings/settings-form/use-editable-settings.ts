"use client";

import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";

import { applyDensity } from "@/components/app-settings-sync";
import { toEditable, type EditableSettings } from "@/components/settings/settings-form/model";
import { apiClient } from "@/lib/api/client";
import type { SettingsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";
import { markThemeChosen } from "@/lib/theme-preference";

/**
 * Настройки, которые хранятся в учёте: их значения на экране, строка
 * «Сохраняю… / Сохранено» и автосохранение.
 *
 * `persist` — новая на каждой отрисовке и читает `settings` той же отрисовки,
 * как и было, когда она жила прямо в SettingsForm.
 */
export function useEditableSettings(pageData: SettingsPageData, reload: () => Promise<unknown>) {
  const { setTheme } = useTheme();
  const { t } = useI18n();
  const [settings, setSettings] = useState<EditableSettings>(() => toEditable(pageData));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

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

  return { settings, setSettings, status, persist };
}
