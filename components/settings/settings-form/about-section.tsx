"use client";

import { Download, GraduationCap, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { shortcuts, type Section, type Translate } from "@/components/settings/settings-form/model";
import { Group, SettingRow } from "@/components/settings/settings-form/primitives";
import { Button } from "@/components/ui/button";
import { WHATS_NEW_OPEN_EVENT } from "@/components/whats-new";
import { APP_VERSION } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";
import { ONBOARDING_REPLAY_EVENT, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";
import { removeMine } from "@/lib/storage/mine";

type AboutSectionProps = {
  checkingUpdate: boolean;
  checkForUpdates: () => Promise<void>;
};

export function aboutSection(t: Translate, props: AboutSectionProps): Section {
  return {
    id: "about",
    label: t("set.nav.about"),
    summary: t("set.nav.about.summary"),
    lead: t("set.nav.about.lead"),
    icon: Info,
    keywords:
      "о приложении about версия version обновления updates что нового whats new изменения changelog горячие клавиши shortcuts обучение onboarding знакомство",
    node: <AboutSection {...props} />
  };
}

function AboutSection({ checkingUpdate, checkForUpdates }: AboutSectionProps) {
  const { t } = useI18n();

  function replayOnboarding() {
    try {
      removeMine(ONBOARDING_STORAGE_KEY);
      window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
      toast.success(t("set.toast.onboardingOpened"));
    } catch {
      toast.error(t("set.toast.onboardingError"));
    }
  }

  return (
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
        <SettingRow label={t("set.about.whatsNew")} hint={t("set.about.whatsNewHint")}>
          <Button
            variant="outline"
            type="button"
            className="w-full"
            onClick={() => window.dispatchEvent(new Event(WHATS_NEW_OPEN_EVENT))}
          >
            <Sparkles className="size-4" />
            {t("set.about.whatsNewOpen")}
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
  );
}
