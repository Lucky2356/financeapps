"use client";

// Плашка «Это пример».
//
// Пример живёт в своём профиле — чтобы осмотреться, не смешивая выдуманные
// суммы со своими. Плашка говорит, где человек сейчас, и возвращает к своим
// данным одной кнопкой: иначе легко забыть, что смотришь не на своё, и начать
// записывать настоящие траты в выдуманный учёт.

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { SAMPLE_PROFILE_ID, type ProfileList } from "@/types/profiles";

const EMPTY: ProfileList = { profiles: [], activeProfileId: "" };

export function SampleBanner() {
  const { t } = useI18n();
  const { data } = useApiPageData(EMPTY, "/profiles");
  const [busy, setBusy] = useState(false);

  if (data.activeProfileId !== SAMPLE_PROFILE_ID) return null;

  async function leave(remove: boolean) {
    setBusy(true);
    try {
      await apiClient.post("/sample/leave", { remove: remove ? "true" : "false" });
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 sm:flex-row sm:items-center"
      data-testid="sample-banner"
    >
      <p className="flex-1 text-sm">
        <span className="font-medium">{t("sample.title")}</span>{" "}
        <span className="text-muted-foreground">{t("sample.desc")}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void leave(false)}>
          {t("sample.back")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void leave(true)}
        >
          {t("sample.remove")}
        </Button>
      </div>
    </div>
  );
}
