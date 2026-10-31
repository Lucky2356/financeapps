"use client";

import { CloudDownload, CloudUpload, FolderOpen, Lock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/context";
import { pickSyncFolder, pullFromFolder, pushToFolder } from "@/lib/sync/FolderSyncService";
import { type AutoBackupConfig, type BackupFrequency } from "@/lib/backup/auto-backup";
import {
  loadAutoBackupConfig,
  loadAutoBackupPassword,
  runAutoBackup,
  saveAutoBackupConfig,
  saveAutoBackupPassword,
  setLastBackupRun
} from "@/lib/backup/AutoBackupService";
import { MIN_BACKUP_PASSWORD } from "@/lib/backup/encryption";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { readMine, writeMine } from "@/lib/storage/mine";
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
//
// Копии по расписанию жили здесь же и уехали в «Данные», к резервной копии:
// это не синхронизация, а страховка, и искать её человек будет рядом с копией.
export function CloudSyncPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [folder, setFolder] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setFolder(readMine(FOLDER_KEY));
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
      writeMine(FOLDER_KEY, picked);
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
    <Card className={embedded ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={embedded ? "hidden" : undefined}>
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

        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          {t("sync.warning")}
        </p>
      </CardContent>
    </Card>
  );
}

// Scheduled local backups: a timestamped snapshot written to a chosen folder on
// app start, with rotation. Папка часто облачная, поэтому файлы можно запереть
// паролем; пароль хранится только на этом устройстве (см. AutoBackupService).
export function AutoBackupPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AutoBackupConfig>({
    frequency: "off",
    folder: null,
    keep: 7,
    encrypt: false
  });
  const [busy, setBusy] = useState(false);
  /** Есть ли пароль к копиям на этом устройстве. null — ещё не знаем. */
  const [passwordKept, setPasswordKept] = useState<boolean | null>(null);
  /** Открыта ли форма пароля: при включении шифрования и при смене пароля. */
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setConfig(loadAutoBackupConfig()));
    loadAutoBackupPassword()
      .then((found) => setPasswordKept(found !== null))
      .catch(() => setPasswordKept(false));
  }, []);

  function update(next: Partial<AutoBackupConfig>) {
    const merged = { ...config, ...next };
    setConfig(merged);
    saveAutoBackupConfig(merged);
  }

  function closePasswordForm() {
    setEditingPassword(false);
    setPassword("");
    setRepeat("");
    setPasswordError(null);
  }

  async function toggleEncrypt(on: boolean) {
    if (on) {
      // Включится по-настоящему, когда пароль сохранён: настройка «шифровать»
      // без пароля значила бы копии, которые не пишутся вовсе.
      setEditingPassword(true);
      return;
    }
    closePasswordForm();
    if (!config.encrypt) return;
    update({ encrypt: false });
    try {
      await saveAutoBackupPassword(null);
    } catch {
      /* стереть не вышло — пароль ничего не значит, раз шифрование выключено */
    }
    setPasswordKept(false);
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    if (password.length < MIN_BACKUP_PASSWORD) {
      return setPasswordError(t("backupPw.tooShort", { n: MIN_BACKUP_PASSWORD }));
    }
    if (password !== repeat) return setPasswordError(t("backupPw.mismatch"));
    try {
      await saveAutoBackupPassword(password);
    } catch (error) {
      return setPasswordError(error instanceof Error ? error.message : t("backup.error"));
    }
    update({ encrypt: true });
    setPasswordKept(true);
    closePasswordForm();
    toast.success(t("backup.pw.saved"));
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

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="backup-encrypt" className="flex items-center gap-2">
                <Lock className="size-4" />
                {t("backup.encrypt")}
              </Label>
              <p id="backup-encrypt-hint" className="text-xs text-muted-foreground">
                {t("backup.encryptHint")}
              </p>
            </div>
            <Switch
              id="backup-encrypt"
              checked={Boolean(config.encrypt) || editingPassword}
              onChange={(on) => void toggleEncrypt(on)}
              aria-describedby="backup-encrypt-hint"
            />
          </div>

          {editingPassword ? (
            <form onSubmit={(event) => void savePassword(event)} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="backup-password">{t("backup.pw.label")}</Label>
                  <Input
                    id="backup-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="backup-password-repeat">{t("backupPw.repeat")}</Label>
                  <Input
                    id="backup-password-repeat"
                    type="password"
                    autoComplete="new-password"
                    value={repeat}
                    onChange={(event) => setRepeat(event.target.value)}
                  />
                </div>
              </div>
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                {t("backup.pw.warn")}
              </p>
              {passwordError ? (
                <p role="alert" className="text-sm text-destructive">
                  {passwordError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm">
                  {t("backup.pw.save")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={closePasswordForm}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : config.encrypt ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {passwordKept === false ? (
                <p className="text-destructive">{t("backup.pw.missing")}</p>
              ) : (
                <p className="text-muted-foreground">{t("backup.pw.kept")}</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingPassword(true)}
              >
                {passwordKept === false ? t("backup.pw.set") : t("backup.pw.change")}
              </Button>
            </div>
          ) : null}
        </div>

        <Button type="button" variant="outline" onClick={() => void runNow()} disabled={busy}>
          <CloudUpload className="size-4" />
          {busy ? t("backup.running") : t("backup.runNow")}
        </Button>
      </CardContent>
    </Card>
  );
}
