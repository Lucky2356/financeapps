"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type {
  EditableSettings,
  Persist,
  Section,
  Translate
} from "@/components/settings/settings-form/model";
import {
  Group,
  SelectField,
  SettingRow,
  ToggleRow
} from "@/components/settings/settings-form/primitives";
import { Input } from "@/components/ui/input";
import { ALL_OPTION, SelectItem } from "@/components/ui/select";
import { AI_EFFORTS, AI_PROVIDERS, providerInfo, type AiProvider } from "@/lib/ai/models";
import { useI18n } from "@/lib/i18n/context";

type AiSectionProps = {
  settings: EditableSettings;
  setSettings: Dispatch<SetStateAction<EditableSettings>>;
  persist: Persist;
};

export function aiSection(t: Translate, props: AiSectionProps): Section {
  return {
    id: "ai",
    label: t("set.nav.ai"),
    summary: t("set.nav.ai.summary"),
    lead: t("set.nav.ai.lead"),
    icon: Sparkles,
    keywords:
      "ии ai claude chatgpt deepseek ассистент помощник assistant ключ key api модель model",
    node: <AiSection {...props} />
  };
}

function AiSection({ settings, setSettings, persist }: AiSectionProps) {
  const { t } = useI18n();

  return (
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
  );
}
