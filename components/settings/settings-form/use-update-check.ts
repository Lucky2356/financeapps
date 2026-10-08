"use client";

import { useState } from "react";
import { toast } from "sonner";

import { RELEASES_URL, withTeaser } from "@/components/settings/settings-form/model";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { isAndroidShell } from "@/lib/platform/device";

/** Кнопка «Проверить обновления» в разделе «О приложении». */
export function useUpdateCheck() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Built-in updater (plan D4). In a signed desktop build the Tauri updater
  // checks GitHub for a newer release and installs it in place; otherwise the
  // button opens the releases page.
  async function checkForUpdates() {
    // Android has no updater plugin, so the app reads the same release manifest
    // itself, downloads the APK in-app (with progress) and opens the system
    // installer. Only the final «Установить» is Android's.
    if (isAndroidShell()) {
      try {
        setCheckingUpdate(true);
        const { checkAndroidUpdate, installAndroidUpdate, markChecked } =
          await import("@/lib/updates/android");
        const update = await checkAndroidUpdate();
        markChecked();
        if (!update) {
          toast.success(t("set.update.current"));
          return;
        }
        const confirmed = await confirm({
          title: t("set.update.available", { version: update.version }),
          description: withTeaser(update.notes, t("set.update.androidConfirm")),
          confirmLabel: t("set.update.confirmLabel")
        });
        if (!confirmed) return;
        // 40 МБ по мобильной сети — это не мгновенно: без процента человек
        // решит, что кнопка не сработала, и нажмёт ещё раз.
        void installAndroidUpdate(update, {
          downloading: t("set.update.downloading"),
          progress: (percent) => t("set.update.progress", { percent }),
          opening: t("set.update.opening"),
          failed: t("set.update.failed"),
          retry: t("set.update.retry")
        });
      } catch (error) {
        // A phone has no devtools, so a bare "недоступно" leaves the owner
        // (and me) with nothing to go on: the text names which source failed
        // and why. The browser stays closed — the button is right here to retry.
        const detail = error instanceof Error ? error.message : String(error);
        console.error("[updater:android]", error);
        toast.error(t("set.update.checkFailed"), { description: detail, duration: 15_000 });
      } finally {
        setCheckingUpdate(false);
      }
      return;
    }
    try {
      setCheckingUpdate(true);
      // Same path the background check uses, retry included: one failed
      // request used to be reported as "автообновление недоступно".
      const { checkDesktopUpdate } = await import("@/lib/updates/desktop");
      const { markChecked } = await import("@/lib/updates/schedule");
      const update = await checkDesktopUpdate();
      markChecked("desktop");
      if (!update) {
        toast.success(t("set.update.current"));
        return;
      }
      const confirmed = await confirm({
        title: t("set.update.available", { version: update.version }),
        description: withTeaser(update.notes, t("set.update.downloadConfirm")),
        confirmLabel: t("set.update.confirmLabel")
      });
      if (!confirmed) return;
      toast.info(t("set.update.downloading"));
      await update.install();
    } catch (error) {
      // SHOW the real reason, do not just log it: devtools are not available in
      // a packaged build, so "обновления недоступны" on its own left no way to
      // tell a network problem from a broken manifest — which cost a whole
      // debugging round after 1.6.0.
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[updater]", error);
      toast.message(t("set.update.unavailable"), {
        description: reason,
        duration: 12_000
      });
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(RELEASES_URL);
      } catch {
        /* opener unavailable (e.g. plain local build) — nothing more to do */
      }
    } finally {
      setCheckingUpdate(false);
    }
  }

  return { checkingUpdate, checkForUpdates };
}
