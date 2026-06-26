"use client";

import { AlertTriangle } from "lucide-react";

import type { DataSource } from "@/types/finance";
import { useI18n } from "@/lib/i18n/context";
import { runtimeConfig } from "@/lib/platform/env";

export function SourceBanner({ source }: { source: DataSource }) {
  const { t } = useI18n();
  // Desktop-local mode uses IndexedDB, never PostgreSQL — banner is irrelevant
  if (runtimeConfig.platform === "desktop" && runtimeConfig.desktopDataMode === "local") {
    return null;
  }

  if (source !== "demo-fallback") return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/15 p-4 text-sm text-warning-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{t("src.demoTitle")}</p>
        <p className="mt-1 text-muted-foreground">
          {t("src.demoBodyBefore")}
          <code className="rounded bg-warning/20 px-1 py-0.5 font-mono text-xs">DATABASE_URL</code>
          {t("src.demoBodyAfter")}
        </p>
      </div>
    </div>
  );
}
