"use client";

import { Database, Sparkles, Trash2 } from "lucide-react";

import { ImportExportPanel } from "@/components/import/import-export-panel";
import { BeforeClearCard } from "@/components/settings/before-clear-card";
import { AutoBackupPanel } from "@/components/settings/cloud-sync-panel";
import { LocalCopiesCard } from "@/components/settings/local-copies-card";
import type { Section, Translate } from "@/components/settings/settings-form/model";
import { Group, SettingRow } from "@/components/settings/settings-form/primitives";
import { TrashCard } from "@/components/settings/trash-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import type { ImportPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";

type DataSectionProps = {
  android: boolean;
  loadingSample: boolean;
  loadSampleData: () => Promise<void>;
  clearing: boolean;
  clearAllData: () => Promise<void>;
};

export function dataSection(t: Translate, props: DataSectionProps): Section {
  return {
    id: "data",
    label: t("set.nav.data"),
    summary: t("set.nav.data.summary"),
    lead: t("set.nav.data.lead"),
    icon: Database,
    keywords:
      "данные data импорт import csv выгрузка экспорт export загрузить restore демо demo пример очистить clear удалить backup резервная копия snapshot копии на устройстве главное устройство local copies",
    node: <DataSection {...props} />
  };
}

function DataSection({
  android,
  loadingSample,
  loadSampleData,
  clearing,
  clearAllData
}: DataSectionProps) {
  const { t } = useI18n();

  return (
    <>
      {/* Everything that moves data in or out of the app: the copy of it,
          the CSV import and the exports. */}
      <ImportExportPanel
        data={{ source: "database", accounts: [], categories: [] } as ImportPageData}
        transactions={[]}
        afterBackup={android ? null : <AutoBackupPanel />}
      />
      <Group title={t("trash.title")}>
        <TrashCard />
      </Group>
      <Group title={t("set.localCopies.title")}>
        <LocalCopiesCard />
      </Group>
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
        <BeforeClearCard />
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
  );
}
