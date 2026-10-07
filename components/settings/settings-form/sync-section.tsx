"use client";

import { ChevronDown, RefreshCw } from "lucide-react";

import { CloudSyncPanel } from "@/components/settings/cloud-sync-panel";
import type { Section, Translate } from "@/components/settings/settings-form/model";
import { SyncPanel } from "@/components/sync/sync-panel";
import { useI18n } from "@/lib/i18n/context";

type SyncSectionProps = {
  android: boolean;
};

export function syncSection(t: Translate, props: SyncSectionProps): Section {
  return {
    id: "sync",
    label: t("set.nav.sync"),
    summary: t("set.nav.sync.summary"),
    lead: t("set.nav.sync.lead"),
    icon: RefreshCw,
    keywords:
      "синхронизация sync устройства devices телефон phone компьютер служба server сервер код связки pairing qr облако cloud папка folder dropbox drive",
    node: <SyncSection {...props} />
  };
}

function SyncSection({ android }: SyncSectionProps) {
  const { t } = useI18n();

  return (
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
              <span className="block text-xs text-muted-foreground">{t("set.sync.otherHint")}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t">
            <CloudSyncPanel embedded />
          </div>
        </details>
      )}
    </>
  );
}
