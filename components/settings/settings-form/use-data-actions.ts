"use client";

import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { forgetMyData } from "@/lib/storage/mine";

/**
 * «Загрузить пример» и «Очистить всё» из раздела «Данные». Состояние — в
 * SettingsForm, а не в разделе: ушёл в другой раздел и вернулся — кнопка всё
 * ещё занята, пока идёт загрузка.
 */
export function useDataActions() {
  const { t } = useI18n();
  const [clearing, setClearing] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  async function loadSampleData() {
    try {
      setLoadingSample(true);
      await apiClient.post("/sample", {});
      toast.success(t("set.toast.sampleLoaded"));
      await new Promise((r) => setTimeout(r, 400));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.toast.sampleError"));
      setLoadingSample(false);
    }
  }

  async function clearAllData() {
    try {
      setClearing(true);
      await apiClient.delete("/storage/clear");
      forgetMyData();
      toast.success(t("set.toast.cleared"));
      await new Promise((r) => setTimeout(r, 600));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("set.toast.clearError"));
      setClearing(false);
    }
  }

  return { clearing, loadingSample, loadSampleData, clearAllData };
}
