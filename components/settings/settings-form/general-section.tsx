"use client";

import { SlidersHorizontal } from "lucide-react";

import { MenuSectionRows } from "@/components/settings/menu-sections";
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
import type { DevicePreferences } from "@/components/settings/settings-form/use-device-preferences";
import { Segmented } from "@/components/ui/segmented";
import { SelectItem } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency";
import type { AccountsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";
import {
  START_SCREENS,
  areAmountsHidden,
  areKopecksShown,
  setAmountsHidden,
  setKopecksShown,
  setStartScreen,
  setTextSize,
  type StartScreen
} from "@/lib/preferences";
import { DEFAULT_ACCOUNT_KEY, removeMine, writeMine } from "@/lib/storage/mine";

type GeneralSectionProps = {
  settings: EditableSettings;
  persist: Persist;
  prefs: DevicePreferences;
  accounts: AccountsPageData["accounts"];
};

export function generalSection(t: Translate, props: GeneralSectionProps): Section {
  return {
    id: "general",
    label: t("set.nav.general"),
    summary: t("set.nav.general.summary"),
    lead: t("set.nav.general.lead"),
    icon: SlidersHorizontal,
    keywords:
      "основные general валюта currency язык language русский english тема theme светлая light тёмная dark системная system плотность density внешний вид appearance копейки kopecks крупный текст шрифт large text font запуск start экран screen счёт account по умолчанию default скрыть суммы hide amounts privacy разделы меню скрыть убрать инвестиции кэшбэк поездки вычеты menu sections hide",
    node: <GeneralSection {...props} />
  };
}

function GeneralSection({ settings, persist, prefs, accounts }: GeneralSectionProps) {
  const { t, locale, setLocale } = useI18n();
  const {
    homeTransfers,
    setHomeTransfers,
    textSize,
    setTextSizeState,
    startScreen,
    setStartScreenState,
    defaultAccount,
    setDefaultAccount
  } = prefs;
  const selectedTheme = settings.theme;
  const selectedDensity = settings.density;

  return (
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
      <Group title={t("set.group.menu")}>
        <MenuSectionRows />
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
  );
}
