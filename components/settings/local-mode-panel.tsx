"use client";

import { Database, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { LocalSnapshotService, type LocalSnapshotMetadata } from "@/lib/local/LocalSnapshotService";
import { isLocalDesktopMode, runtimeConfig } from "@/lib/platform/env";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";

// Desktop local-mode utility (IndexedDB snapshot). Hidden on the web app, where
// it is irrelevant and confusing for end users.
export function LocalModePanel() {
  if (!isLocalDesktopMode) return null;
  return <LocalModePanelInner />;
}

function LocalModePanelInner() {
  const { t } = useI18n();
  const [metadata, setMetadata] = useState<LocalSnapshotMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const service = useMemo(() => new LocalSnapshotService(apiClient, createStorageAdapter()), []);

  useEffect(() => {
    void service.metadata().then(setMetadata);
  }, [service]);

  async function saveSnapshot() {
    setLoading(true);
    try {
      const saved = await service.saveFromApi();
      setMetadata(saved);
      toast.success(t("lmp.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("lmp.saveFail"));
    } finally {
      setLoading(false);
    }
  }

  async function clearSnapshot() {
    setLoading(true);
    try {
      await service.clear();
      setMetadata(null);
      toast.success(t("lmp.cleared"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("lmp.clearFail"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("lmp.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{t("lmp.snapshotTitle")}</p>
              <p className="mt-1 text-muted-foreground">{t("lmp.snapshotDesc")}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("lmp.runtime", {
                  platform: runtimeConfig.platform,
                  dataMode: runtimeConfig.desktopDataMode,
                  apiMode: runtimeConfig.apiMode
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">{t("lmp.lastSnapshot")}</p>
            <p className="mt-2 text-muted-foreground">
              {metadata ? formatDate(metadata.savedAt) : t("lmp.never")}
            </p>
            {metadata ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("lmp.sections", { n: metadata.keys.length })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" onClick={saveSnapshot} disabled={loading}>
              <RefreshCw className="size-4" />
              {t("lmp.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearSnapshot}
              disabled={loading || !metadata}
            >
              <Trash2 className="size-4" />
              {t("lmp.clear")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
