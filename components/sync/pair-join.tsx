"use client";

// Подключиться к устройству, где данные уже есть, — по картинке или по ссылке.
//
// Сканирует то устройство, у которого есть камера. На телефоне главный путь —
// камера: навёл на код с экрана компьютера и готово. У компьютера камеры
// обычно нет — тогда код показывает ОН, а снимает телефон с данными (см.
// PairWait). Поле для ссылки остаётся запасным путём на обоих.

import { Camera } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PairWait } from "@/components/sync/pair-wait";
import { ReplaceLocal, saveProfilesToFiles } from "@/components/sync/replace-local";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { DEFAULT_SERVER } from "@/lib/sync/default-server";
import { cameraPossible, scanQr } from "@/lib/sync/scan-qr";
import { apiClient } from "@/lib/api/client";
import type { ProfilesBackup } from "@/lib/api/LocalApiClient";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { carryOver, peekCarryOver, takeCarryOver } from "@/lib/sync/carry-over";
import { OwnRecordsError } from "@/lib/vault/account";
import { joinWithLink, sharedBooksArrived } from "@/lib/vault/runtime";

export function PairJoin({
  onJoined,
  onCancel,
  initialLink
}: {
  /** Данные приняты. По умолчанию — перечитать приложение. */
  onJoined?: () => void;
  onCancel?: () => void;
  /** Ссылка из QR, которой открыли приложение: подключаемся по ней сразу. */
  initialLink?: string;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Без камеры своя картинка нужна сразу: другого пути, кроме пересланной
  // ссылки, у компьютера нет. С камерой — по желанию.
  const [showOwn, setShowOwn] = useState(() => !cameraPossible());
  // Ссылка, которую не приняли из-за своих записей на устройстве: после
  // замены подключаемся по ней же, не заставляя снимать код второй раз.
  const [replacing, setReplacing] = useState<string | null>(null);

  const fileSystem = useMemo(() => createFileSystemAdapter(), []);
  // Подключились, но свои записи («Объединить») добавить не вышло. Пока это
  // так, экран не уходит и не перечитывается: записи живут только в памяти
  // вкладки, и перезагрузка стёрла бы их навсегда.
  const [mergeFailed, setMergeFailed] = useState<string | null>(null);
  const [savedToFile, setSavedToFile] = useState(false);

  const finish = useCallback(async () => {
    toast.success(t("sync2.join.done"));
    if (onJoined) onJoined();
    else {
      // Данные приехали в хранилище, а не на экран, — перечитать проще и
      // надёжнее, чем рассказывать о них каждому экрану по отдельности.
      await new Promise((resolve) => setTimeout(resolve, 600));
      window.location.reload();
    }
  }, [onJoined, t]);

  const joined = useCallback(async () => {
    // «Объединить»: свои записи, снятые до подключения, — к общим данным.
    //
    // Раньше неудача здесь показывалась всплывашкой, а следом шло «готово» и
    // перезагрузка — и записи, которых больше нигде нет, пропадали молча.
    // Теперь они возвращаются в память, а экран показывает ошибку и выход:
    // повторить или сохранить их в файл.
    const carried = takeCarryOver();
    if (carried) {
      // Сначала — общие данные. Связь медленная, и они ещё едут — записи
      // ждут в памяти, а человек видит «повторить» и «сохранить в файл».
      if (!(await sharedBooksArrived())) {
        carryOver(carried);
        setMergeFailed(t("sync2.merge.notArrived"));
        return;
      }
      try {
        await apiClient.post("/backup/merge", { backup: carried });
      } catch (cause) {
        carryOver(carried);
        setMergeFailed(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    }
    setMergeFailed(null);
    await finish();
  }, [finish, t]);

  async function retryMerge() {
    setBusy(true);
    try {
      await joined();
    } finally {
      setBusy(false);
    }
  }

  async function saveCarried() {
    const carried = peekCarryOver();
    if (!carried) return;
    setBusy(true);
    try {
      const saved =
        typeof carried === "object" && (carried as Partial<ProfilesBackup>).format === "profiles"
          ? await saveProfilesToFiles(fileSystem, carried as ProfilesBackup)
          : await fileSystem.saveTextFile(
              "financial-assistant-backup.json",
              JSON.stringify(carried, null, 2),
              "application/json;charset=utf-8"
            );
      if (saved) {
        setSavedToFile(true);
        toast.success(t("imp.toast.backupSaved"));
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  /** Записи в файле — держать их в памяти дальше незачем. */
  async function continueWithoutMerge() {
    takeCarryOver();
    setMergeFailed(null);
    await finish();
  }

  async function join(raw: string) {
    setError(null);
    setBusy(true);
    try {
      await joinWithLink(raw, DEFAULT_SERVER);
      await joined();
    } catch (cause) {
      if (cause instanceof OwnRecordsError) setReplacing(raw);
      else setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Приложение открыли ссылкой из QR — камера и поле не нужны, код уже здесь.
  // Через таймер, а не прямо в эффекте: подключение меняет состояние экрана.
  const opened = useRef(false);
  const joinOpened = useEffectEvent((link: string) => {
    setLink(link);
    void join(link);
  });
  useEffect(() => {
    if (!initialLink || opened.current) return;
    opened.current = true;
    const timer = window.setTimeout(() => joinOpened(initialLink), 0);
    return () => window.clearTimeout(timer);
  }, [initialLink]);

  async function openCamera() {
    setError(null);
    setBusy(true);
    const shot = await scanQr();
    setBusy(false);
    if (shot.ok) {
      setLink(shot.text);
      await join(shot.text);
      return;
    }
    if (shot.why === "cancelled") return;
    setError(
      shot.why === "denied"
        ? t("server.cameraDenied")
        : shot.why === "absent"
          ? t("server.cameraAbsent")
          : t("server.cameraBroken")
    );
  }

  if (mergeFailed !== null) {
    return (
      <div
        className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
        data-testid="merge-failed"
      >
        <p className="text-sm font-medium">{t("sync2.merge.failed")}</p>
        <p className="text-sm text-destructive">{mergeFailed}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" disabled={busy} onClick={() => void retryMerge()}>
            {t("error.retry")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void saveCarried()}
          >
            {t("sync2.merge.save")}
          </Button>
          {savedToFile ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void continueWithoutMerge()}
            >
              {t("sync2.merge.continue")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (replacing !== null) {
    return (
      <ReplaceLocal
        onReplaced={() => {
          const raw = replacing;
          setReplacing(null);
          void join(raw);
        }}
        onCancel={() => setReplacing(null)}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="pair-join">
      {cameraPossible() ? (
        <p className="text-sm text-muted-foreground">{t("sync2.join.lead")}</p>
      ) : null}

      {cameraPossible() ? (
        <Button type="button" className="w-full" disabled={busy} onClick={() => void openCamera()}>
          <Camera className="size-4" />
          {t("sync2.join.camera")}
        </Button>
      ) : null}

      {showOwn ? (
        <PairWait base={DEFAULT_SERVER} onJoined={() => void joined()} />
      ) : (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setShowOwn(true)}
          >
            {t("sync2.wait.show")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("sync2.wait.showHint")}</p>
        </div>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void join(link);
        }}
      >
        <Label htmlFor="pair-link">
          {cameraPossible() ? t("sync2.join.linkLabel") : t("sync2.join.linkOnly")}
        </Label>
        <Input
          id="pair-link"
          autoComplete="off"
          autoCapitalize="none"
          placeholder="financeapps://pair?…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">{t("sync2.join.linkHint")}</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant={cameraPossible() ? "secondary" : "default"}
            disabled={busy}
          >
            {busy ? t("sync2.join.working") : t("sync2.join.submit")}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("sync2.cancel")}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
