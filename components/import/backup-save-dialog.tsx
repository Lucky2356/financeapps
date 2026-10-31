"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

import { MIN_BACKUP_PASSWORD } from "@/lib/backup/encryption";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Перед сохранением копии — предложить пароль.
 *
 * Копию сохраняют, чтобы унести: в облачную папку, на флешку, в переписку
 * «самому себе». Там её прочтёт любой, у кого окажется файл, — а в ней вся
 * история денег. Поэтому пароль стоит первым и главной кнопкой.
 *
 * Без пароля сохранить тоже можно, и нарочно: кому-то нужен читаемый JSON —
 * разобрать его своей программой или просто посмотреть. Это вторая кнопка, а
 * не галочка, которую легко не заметить: выбор делается осознанно.
 *
 * Пароль нигде не хранится. Забытый пароль — потерянная копия, и это сказано
 * прямо над кнопкой, а не в справке.
 */
export function BackupSaveDialog({
  open,
  onOpenChange,
  onSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Пароль — запереть файл; null — сохранить открытым. */
  onSave: (password: string | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setPassword("");
    setRepeat("");
    setError(null);
  }

  async function save(withPassword: boolean) {
    setError(null);
    if (withPassword) {
      if (password.length < MIN_BACKUP_PASSWORD) {
        return setError(t("backupPw.tooShort", { n: MIN_BACKUP_PASSWORD }));
      }
      if (password !== repeat) return setError(t("backupPw.mismatch"));
    }
    setBusy(true);
    try {
      await onSave(withPassword ? password : null);
      // Пароль не задерживается в памяти окна дольше, чем нужен.
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("backupSave.title")}</DialogTitle>
          <DialogDescription>{t("backupSave.lead")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="backup-save-password">{t("backupSave.password")}</Label>
            <Input
              id="backup-save-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="backup-save-repeat">{t("backupPw.repeat")}</Label>
            <Input
              id="backup-save-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          </div>
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
            {t("backupSave.warn")}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" disabled={busy}>
              <Lock className="size-4" />
              {busy ? t("backupSave.saving") : t("backupSave.encrypted")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void save(false)}
              className="h-auto whitespace-normal py-2"
            >
              {t("backupSave.plain")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("backupSave.plainHint")}</p>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
