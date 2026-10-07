"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { isAndroidShell } from "@/lib/platform/device";
import type { AccountsPageData, SettingsPageData } from "@/lib/data";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { aboutSection } from "@/components/settings/settings-form/about-section";
import { aiSection } from "@/components/settings/settings-form/ai-section";
import { dataSection } from "@/components/settings/settings-form/data-section";
import { financeSection } from "@/components/settings/settings-form/finance-section";
import { generalSection } from "@/components/settings/settings-form/general-section";
import {
  MOVED_SECTIONS,
  noSubscribe,
  type Section
} from "@/components/settings/settings-form/model";
import { SaveStatus, SectionView } from "@/components/settings/settings-form/primitives";
import { securitySection } from "@/components/settings/settings-form/security-section";
import { SettingsNav, SettingsSearch } from "@/components/settings/settings-form/settings-nav";
import { syncSection } from "@/components/settings/settings-form/sync-section";
import { useDataActions } from "@/components/settings/settings-form/use-data-actions";
import { useDevicePreferences } from "@/components/settings/settings-form/use-device-preferences";
import { useEditableSettings } from "@/components/settings/settings-form/use-editable-settings";
import { usePhoneFeatures } from "@/components/settings/settings-form/use-phone-features";
import { useUpdateCheck } from "@/components/settings/settings-form/use-update-check";
import { cn } from "@/lib/utils";

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const { t } = useI18n();
  const { data: pageData, reload } = useApiPageData(data, "/settings");
  const { settings, setSettings, status, persist } = useEditableSettings(pageData, reload);
  const { clearing, loadingSample, loadSampleData, clearAllData } = useDataActions();
  const { checkingUpdate, checkForUpdates } = useUpdateCheck();
  const router = useRouter();
  // Открытый раздел живёт в адресе (?section=data), а не в состоянии экрана.
  // Так ссылка «Данные» из меню открывает нужный раздел, а кнопка «назад» на
  // телефоне возвращает к списку разделов, а не уводит с настроек вовсе.
  const requestedSection = useSearchParams().get("section");
  const chosen = requestedSection ? (MOVED_SECTIONS[requestedSection] ?? requestedSection) : null;
  const activeId = chosen ?? "general";
  const [query, setQuery] = useState("");
  const prefs = useDevicePreferences();
  // Всё телефонное — здесь, а не в разделе: переживает переход между разделами.
  const phone = usePhoneFeatures();
  const [accounts, setAccounts] = useState<AccountsPageData["accounts"]>([]);
  useEffect(() => {
    let alive = true;
    apiClient
      .get("/accounts")
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

  // ── Разделы ─────────────────────────────────────────────────────────
  //
  // Семь разделов, и на экране всегда один. Прежде они шли одной лентой в
  // девять экранов телефона, и владелец сказал прямо: «чтоб человеку не нужно
  // было миллион лет листать». Раскладка по смыслу, а не по тому, в каком
  // выпуске настройка появилась: всё, что про другие устройства, — в
  // «Синхронизации», всё, что про пароль и соседей по устройству, — в «Пароле и
  // доступе», и «Данные» перестали быть свалкой из восьми карточек.
  //
  // Собираются заново на каждой отрисовке — без useMemo. Раньше их запоминали со
  // списком зависимостей, и каждый забытый в нём переключатель («Переводы на
  // главной», потом «Лоли», «Траты из уведомлений банка», «Вечером напомнить»)
  // сохранял нажатие, а на экране не менялся. Экран лёгкий: пересобрать дешевле,
  // чем однажды снова забыть. Содержимое каждого раздела — в своём файле в
  // settings-form/; всё состояние — здесь и в хуках, и приходит туда свойствами.
  const sections: Section[] = [
    generalSection(t, { settings, persist, prefs, accounts }),
    financeSection(t, { settings, persist, phone, riskProfiles: pageData.riskProfiles }),
    aiSection(t, { settings, setSettings, persist }),
    syncSection(t, { android }),
    securitySection(t),
    dataSection(t, { android, loadingSample, loadSampleData, clearing, clearAllData }),
    aboutSection(t, { checkingUpdate, checkForUpdates })
  ];

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

  const statusLine = <SaveStatus status={status} />;

  const search = <SettingsSearch query={query} onQueryChange={setQuery} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start">
      <SettingsNav
        sections={sections}
        currentId={current.id}
        hidden={Boolean(chosen || trimmedQuery)}
        trimmedQuery={trimmedQuery}
        search={search}
        onOpen={open}
      />

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
