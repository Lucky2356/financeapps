"use client";

// «Мои устройства» — список всего, что подключено к учётной записи, и выдача
// кода связки для следующего.
//
// ПОЧЕМУ ЭКРАН НУЖЕН. Ручка `/devices` на службе была с самого начала, а экрана
// не было: в server/README.md об этом было написано прямо — «приложение к этой
// ручке ещё не ходит». Человек, потерявший телефон, не мог выкинуть его билет
// иначе как через curl. Билет живёт месяц.
//
// ЧТО ЗДЕСЬ ГОВОРИТСЯ ВСЛУХ. «Выкинуть» — это про связь, а не про данные: на
// потерянном устройстве книга остаётся целиком, просто перестаёт ездить.
// Человек, нажимающий эту кнопку после кражи, рассчитывает на другое, и
// промолчать значило бы дать ему ложное спокойствие. Стереть данные с чужих рук
// приложение не может, и обещать этого не будет.
//
// ПОЧЕМУ КОД ЖИВЁТ ЗДЕСЬ, А НЕ НА ЭКРАНЕ ПОДКЛЮЧЕНИЯ. Код выдаёт устройство, на
// котором данные УЖЕ есть, — то есть подключённое. Экран подключения к этому
// моменту показывает «отвязать», и место для «связать ещё одно» там же, где
// список уже связанных.
//
// КАРТИНКА ПОЯВИЛАСЬ ВМЕСТЕ С ЧИТАТЕЛЕМ, И ИМЕННО В ЭТОМ ПОРЯДКЕ. Пока камеры
// на втором устройстве не было, QR экономил ровно ноль: восемь знаков человек
// набирает быстрее, чем наводит телефон, — и показывать картинку, которую
// некому прочитать, значило бы делать вид, что путь есть. Теперь читатель есть,
// и картинка встала рядом с кодом, а не вместо него: набрать руками можно
// по-прежнему, и это по-прежнему единственный путь, если камера занята,
// запрещена или её нет вовсе.

import { Crown, Laptop, LogOut, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SERVER_LINK_CHANGED } from "@/components/settings/server-panel";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useI18n } from "@/lib/i18n/context";
import { accountService, serverAccount } from "@/lib/vault/runtime";
import type { LinkedDevice } from "@/lib/vault/server-account";

/** «ABCDEFGH» → «ABCD-EFGH»: восемь знаков подряд глаз теряет. */
export function groupCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function DevicesPanel() {
  const { t, locale } = useI18n();
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  // Главное устройство: только с него выкидывают другие. undefined — служба
  // старше 2.3.0, главного не знает, и всё можно, как раньше.
  const [primary, setPrimary] = useState<string | null | undefined>(undefined);
  // Что подтверждаем: выкинуть устройство или сделать его главным.
  const [confirm, setConfirm] = useState<{
    kind: "forget" | "primary";
    device: LinkedDevice;
  } | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [linked, setLinked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    const link = await serverAccount.link();
    if (!link) {
      setLinked(false);
      return;
    }
    setLinked(true);
    const list = await serverAccount.devices();
    setDevices(list.devices);
    setCurrent(list.current);
    setPrimary(list.primary);
  }, []);

  async function ask(kind: "forget" | "primary", device: LinkedDevice) {
    setPassword("");
    setNeedsPassword(await accountService.hasPassword().catch(() => false));
    setConfirm({ kind, device });
  }

  /** Подтверждено: пароль сверен здесь же, служба его не знает. */
  function confirmed() {
    if (!confirm) return;
    const { kind, device } = confirm;
    void work(
      async () => {
        if (needsPassword && !(await accountService.checkPassword(password))) {
          throw new Error(t("dev.badPassword"));
        }
        if (kind === "primary") {
          await serverAccount.makePrimary(device.id);
          setConfirm(null);
          await refresh();
          return;
        }
        await serverAccount.forgetDevice(device.id);
        setConfirm(null);
        if (device.id === current) {
          // Отключили само себя — связи больше нет, и экран должен это знать.
          await serverAccount.forgetHere();
          window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
          return;
        }
        await refresh();
      },
      kind === "primary" ? t("dev.primaryDone") : t("dev.forgotten")
    );
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await refresh();
      } catch (cause) {
        if (alive) toast.error((cause as Error).message);
      }
      if (alive) setDevices((was) => was ?? []);
    })();
    // Подключили или отвязали это устройство — без перезагрузки: создание
    // записи с этого устройства больше не перечитывает приложение.
    const changed = () => void refresh().catch(() => undefined);
    window.addEventListener(SERVER_LINK_CHANGED, changed);
    return () => {
      alive = false;
      window.removeEventListener(SERVER_LINK_CHANGED, changed);
    };
  }, [refresh]);

  async function work(job: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await job();
      if (done) toast.success(done);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function seen(when: string): string {
    const at = Date.parse(when);
    if (!Number.isFinite(at)) return t("dev.never");
    return t("dev.seen", {
      when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(at)
    });
  }

  if (linked === false) {
    return null;
  }

  // Выкидывать другие — только с главного. Служба старше 2.3.0 главного не
  // знает (undefined) — тогда как раньше.
  const mayManage = primary === undefined || primary === null || primary === current;
  const primaryName = devices?.find((device) => device.id === primary)?.name ?? null;

  return (
    <Card id="set-devices" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Laptop className="size-4" />
          {t("dev.title")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("dev.lead")}</p>

        {devices === null ? (
          <p className="text-sm text-muted-foreground">{t("dev.loading")}</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dev.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((device) => (
              <li key={device.id} className="rounded-lg border bg-card p-3">
                {renaming === device.id ? (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void work(async () => {
                        await serverAccount.renameDevice(device.id, draft);
                        setRenaming(null);
                        await refresh();
                      }, t("dev.renamed"));
                    }}
                  >
                    <Label htmlFor={`device-${device.id}`}>{t("dev.name")}</Label>
                    <Input
                      id={`device-${device.id}`}
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" disabled={busy}>
                        {t("dev.save")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"
                        onClick={() => setRenaming(null)}
                        disabled={busy}
                      >
                        {t("dev.cancel")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {device.name}
                        {device.id === current ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                            {t("dev.current")}
                          </span>
                        ) : null}
                        {device.id === primary ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-primary/12 px-1.5 py-0.5 text-xs font-normal text-primary">
                            <Crown className="size-3" />
                            {t("dev.primary")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {seen(device.last_seen_at)}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setDraft(device.name);
                          setRenaming(device.id);
                        }}
                      >
                        {t("dev.rename")}
                      </Button>
                      {device.id !== current &&
                      mayManage &&
                      device.id !== primary &&
                      primary !== undefined ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"
                          disabled={busy}
                          onClick={() => void ask("primary", device)}
                        >
                          <Crown className="size-4" />
                          {t("dev.makePrimary")}
                        </Button>
                      ) : null}
                      {device.id === current ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"
                          disabled={busy}
                          onClick={() => void ask("forget", device)}
                        >
                          <LogOut className="size-4" />
                          {t("dev.forgetSelf")}
                        </Button>
                      ) : mayManage ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"
                          disabled={busy}
                          onClick={() => void ask("forget", device)}
                        >
                          <Trash2 className="size-4" />
                          {t("dev.forget")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!mayManage && primaryName ? (
          <p className="text-sm text-muted-foreground" data-testid="dev-not-primary">
            {t("dev.onlyPrimary", { name: primaryName })}
          </p>
        ) : null}
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">{t("dev.forgetNote")}</p>
      </CardContent>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "primary"
                ? t("dev.confirmPrimary", { name: confirm.device.name })
                : confirm?.device.id === current
                  ? t("dev.confirmSelf")
                  : t("dev.confirmForget", { name: confirm?.device.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "primary"
                ? t("dev.confirmPrimaryHint")
                : confirm?.device.id === current
                  ? t("dev.confirmSelfHint")
                  : t("dev.confirmForgetHint")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              confirmed();
            }}
          >
            {needsPassword ? (
              <div className="space-y-1.5">
                <Label htmlFor="dev-password">{t("dev.password")}</Label>
                <Input
                  id="dev-password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
                {t("dev.cancel")}
              </Button>
              <Button
                type="submit"
                variant={confirm?.kind === "primary" ? "default" : "destructive"}
                disabled={busy || (needsPassword && !password)}
              >
                {confirm?.kind === "primary"
                  ? t("dev.makePrimary")
                  : confirm?.device.id === current
                    ? t("dev.forgetSelf")
                    : t("dev.forget")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
