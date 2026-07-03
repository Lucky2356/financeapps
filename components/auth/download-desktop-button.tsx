"use client";

import { Download, Monitor } from "lucide-react";

import { DESKTOP_RELEASES_URL } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/context";

// Offers the Windows desktop build on the web auth pages, so a visitor can choose
// between using the app in the browser or installing the .exe. Links to the
// GitHub "latest release" page, where the signed installer is the headline asset
// (no API call — keeps it CSP-safe and always current).
export function DownloadDesktopButton() {
  const { t } = useI18n();
  return (
    <a
      href={DESKTOP_RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Monitor className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t("auth.download.title")}</span>
        <span className="block text-xs text-muted-foreground">{t("auth.download.hint")}</span>
      </span>
      <Download className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}
