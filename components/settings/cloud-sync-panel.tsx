"use client";

import { CloudDownload, CloudUpload, FolderOpen, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/context";
import { isLocalDesktopMode } from "@/lib/platform/env";
import { pickSyncFolder, pullFromFolder, pushToFolder } from "@/lib/sync/FolderSyncService";
import { type AutoBackupConfig, type BackupFrequency } from "@/lib/backup/auto-backup";
import {
  loadAutoBackupConfig,
  runAutoBackup,
  saveAutoBackupConfig,
  setLastBackupRun
} from "@/lib/backup/AutoBackupService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const FOLDER_KEY = "sync-folder";

// Desktop-only server-less sync: writes an encrypted snapshot into a folder the
// user's cloud client (Dropbox / Google Drive / OneDrive) mirrors across
// devices. The passphrase is never stored — it is entered per push/pull.
export function CloudSyncPanel() {
  if (!isLocalDesktopMode) return null;
  return (
    <>
      <CloudSyncPanelInner />
      <AutoBackupSection />
    </>
  );
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

// Scheduled local backups: a timestamped snapshot written to a chosen folder on
// app start, with rotation. No passphrase (on-disk safety copy, not cloud sync).
function AutoBackupSection() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AutoBackupConfig>({
    frequency: "off",
    folder: null,
    keep: 7
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => setConfig(loadAutoBackupConfig()));
  }, []);

  function update(next: Partial<AutoBackupConfig>) {
    const merged = { ...config, ...next };
    setConfig(merged);
    saveAutoBackupConfig(merged);
  }

  async function chooseFolder() {
    try {
      const picked = await pickSyncFolder();
      if (picked) update({ folder: picked });
    } catch {
      toast.error(t("sync.err.folder"));
    }
  }

  async function runNow() {
    if (!config.folder) return toast.error(t("sync.err.noFolder"));
    setBusy(true);
    try {
      await runAutoBackup({
        ...config,
        frequency: config.frequency === "off" ? "daily" : config.frequency
      });
      setLastBackupRun(new Date().toISOString());
      toast.success(t("backup.done"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("backup.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="size-4" />
          {t("backup.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("backup.desc")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("backup.frequency")}</Label>
            <Select
              value={config.frequency}
              onValueChange={(value) => update({ frequency: value as BackupFrequency })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t("backup.freq.off")}</SelectItem>
                <SelectItem value="daily">{t("backup.freq.daily")}</SelectItem>
                <SelectItem value="weekly">{t("backup.freq.weekly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="backup-keep">{t("backup.keep")}</Label>
            <Input
              id="backup-keep"
              type="number"
              min="1"
              max="90"
              value={config.keep}
              onChange={(event) =>
                update({ keep: Math.max(1, Math.min(90, Number(event.target.value) || 1)) })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("backup.folder")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={config.folder ?? ""} placeholder={t("sync.folderPlaceholder")} />
            <Button type="button" variant="outline" onClick={() => void chooseFolder()}>
              <FolderOpen className="size-4" />
              {t("sync.choose")}
            </Button>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={() => void runNow()} disabled={busy}>
          <CloudUpload className="size-4" />
          {busy ? t("backup.running") : t("backup.runNow")}
        </Button>
      </CardContent>
    </Card>
  );
}
