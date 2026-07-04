"use client";

import { CloudDownload, CloudUpload, FolderOpen, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { pickSyncFolder, pullFromFolder, pushToFolder } from "@/lib/sync/FolderSyncService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FOLDER_KEY = "sync-folder";

// Desktop-only server-less sync: writes an encrypted snapshot into a folder the
// user's cloud client (Dropbox / Google Drive / OneDrive) mirrors across
// devices. The passphrase is never stored — it is entered per push/pull.
export function CloudSyncPanel() {
  if (!isLocalDesktopMode) return null;
  return <CloudSyncPanelInner />;
}

function CloudSyncPanelInner() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [folder, setFolder] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setFolder(localStorage.getItem(FOLDER_KEY));
      } catch {
        /* ignore */
      }
    });
  }, []);

  async function choose() {
    try {
      const picked = await pickSyncFolder();
      if (!picked) return;
      setFolder(picked);
      localStorage.setItem(FOLDER_KEY, picked);
    } catch {
      toast.error(t("sync.err.folder"));
    }
  }

  async function push() {
    if (!folder) return toast.error(t("sync.err.noFolder"));
    if (!passphrase) return toast.error(t("sync.err.noPass"));
    setBusy("push");
    try {
      await pushToFolder(folder, passphrase);
      toast.success(t("sync.pushed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sync.err.push"));
    } finally {
      setBusy(null);
    }
  }

  async function pull() {
    if (!folder) return toast.error(t("sync.err.noFolder"));
    if (!passphrase) return toast.error(t("sync.err.noPass"));
    const ok = await confirm({
      title: t("sync.pull.confirmTitle"),
      description: t("sync.pull.confirmDesc"),
      confirmLabel: t("sync.pull")
    });
    if (!ok) return;
    setBusy("pull");
    try {
      await pullFromFolder(folder, passphrase);
      toast.success(t("sync.pulled"));
      await new Promise((r) => setTimeout(r, 500));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sync.err.pull"));
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="size-4" />
          {t("sync.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("sync.desc")}</p>

        <div className="space-y-2">
          <Label>{t("sync.folder")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={folder ?? ""} placeholder={t("sync.folderPlaceholder")} />
            <Button type="button" variant="outline" onClick={() => void choose()}>
              <FolderOpen className="size-4" />
              {t("sync.choose")}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sync-pass">{t("sync.passphrase")}</Label>
          <Input
            id="sync-pass"
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={t("sync.passphrasePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("sync.passphraseHint")}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={() => void push()} disabled={busy !== null}>
            <CloudUpload className="size-4" />
            {busy === "push" ? t("sync.pushing") : t("sync.push")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void pull()}
            disabled={busy !== null}
          >
            <CloudDownload className="size-4" />
            {busy === "pull" ? t("sync.pulling") : t("sync.pull")}
          </Button>
        </div>

        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          {t("sync.warning")}
        </p>
      </CardContent>
    </Card>
  );
}
