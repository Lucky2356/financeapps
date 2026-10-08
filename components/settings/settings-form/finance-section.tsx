"use client";

import { PiggyBank } from "lucide-react";

import { EVENING_REMINDER_KEY, refreshPhoneReminders } from "@/components/phone-reminders";
import type {
  EditableSettings,
  Persist,
  Section,
  Translate
} from "@/components/settings/settings-form/model";
import { Group, SelectField, ToggleRow } from "@/components/settings/settings-form/primitives";
import type { PhoneFeatures } from "@/components/settings/settings-form/use-phone-features";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import { BANK_ENABLED_KEY } from "@/lib/bank/suggestions";
import type { SettingsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";
import { openBankAccess } from "@/lib/platform/android-bank";
import { writeMine } from "@/lib/storage/mine";

type FinanceSectionProps = {
  settings: EditableSettings;
  persist: Persist;
  phone: PhoneFeatures;
  riskProfiles: SettingsPageData["riskProfiles"];
};

export function financeSection(t: Translate, props: FinanceSectionProps): Section {
  return {
    id: "finance",
    label: t("set.nav.finance"),
    summary: t("set.nav.finance.summary"),
    lead: t("set.nav.finance.lead"),
    icon: PiggyBank,
    keywords:
      "финансы finance регулярные recurring автоматизация automation проведение напоминания reminders платежи payments уведомления notifications риск risk профиль profile подушка cushion резерв reserve",
    node: <FinanceSection {...props} />
  };
}

function FinanceSection({ settings, persist, phone, riskProfiles }: FinanceSectionProps) {
  const { t } = useI18n();
  const { onPhone, evening, setEvening, bankOn, setBankOn, bankGranted, loli, changeLoli } = phone;

  return (
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
          onChange={(v) =>
            void persist({ paymentReminders: v }).then(() => refreshPhoneReminders())
          }
        />
        {onPhone ? (
          <ToggleRow
            title={t("set.evening.title")}
            description={t("set.evening.desc")}
            checked={evening}
            onChange={(v) => {
              writeMine(EVENING_REMINDER_KEY, v ? "1" : "0");
              setEvening(v);
              void refreshPhoneReminders();
            }}
          />
        ) : null}
        {onPhone ? (
          <>
            <ToggleRow
              title={t("bank.set.title")}
              description={
                bankOn && bankGranted === false ? t("bank.set.needAccess") : t("bank.set.desc")
              }
              help={t("bank.set.help")}
              checked={bankOn}
              onChange={(v) => {
                writeMine(BANK_ENABLED_KEY, v ? "1" : "0");
                setBankOn(v);
                if (v && bankGranted === false) void openBankAccess();
              }}
            />
            {bankOn && bankGranted === false ? (
              <div className="px-4 pb-4 sm:px-5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void openBankAccess()}
                >
                  {t("bank.set.open")}
                </Button>
              </div>
            ) : null}
            {loli ? (
              <div data-testid="loli-settings">
                <ToggleRow
                  title={t("loli.set.title")}
                  description={
                    !loli.installed
                      ? t("loli.set.missing")
                      : !loli.trusted
                        ? t("loli.set.untrusted", { sign: loli.found ?? "—" })
                        : loli.enabled
                          ? t("loli.set.on")
                          : t("loli.set.desc")
                  }
                  help={t("loli.set.help")}
                  checked={loli.enabled && loli.trusted}
                  disabled={!loli.installed || !loli.trusted}
                  onChange={(v) => changeLoli({ enabled: v })}
                />
                {loli.enabled && loli.trusted ? (
                  <>
                    <ToggleRow
                      title={t("loli.set.auto")}
                      description={t("loli.set.autoDesc")}
                      checked={loli.auto}
                      onChange={(v) => changeLoli({ auto: v })}
                    />
                    <ToggleRow
                      title={t("loli.set.share")}
                      description={t("loli.set.shareDesc")}
                      checked={loli.share}
                      onChange={(v) => changeLoli({ share: v })}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
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
          {riskProfiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.code}>
              {t(`riskProfile.${profile.code}`)} — {t(`riskProfile.${profile.code}.desc`)}
            </SelectItem>
          ))}
        </SelectField>
      </Group>
    </>
  );
}
