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
// QR ЗДЕСЬ НЕТ, И ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК. Картинку некому прочитать: камера
// приезжает следующим этапом, вместе с tauri-plugin-barcode-scanner. QR, на
// который можно только посмотреть, экономит ровно ноль — восемь знаков человек
// и так набирает быстрее, чем наводит телефон. Появится читатель — появится и
// картинка.

import { Copy, Laptop, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { serverAccount } from "@/lib/vault/runtime";
import type { LinkedDevice } from "@/lib/vault/server-account";

/** «ABCDEFGH» → «ABCD-EFGH»: восемь знаков подряд глаз теряет. */
export function groupCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function DevicesPanel() {
  const { t, locale } = useI18n();
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState<string | null>(null);

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
  }, []);

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
    return () => {
      alive = false;
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
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {seen(device.last_seen_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void work(async () => {
                            await serverAccount.forgetDevice(device.id);
                            await refresh();
                          }, t("dev.forgotten"))
                        }
                      >
                        <Trash2 className="size-4" />
                        {t("dev.forget")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="rounded-lg border bg-muted/40 p-3 text-sm">{t("dev.forgetNote")}</p>

        <div className="space-y-3 border-t pt-4">
          {code ? (
            <>
              <p
                className="select-all text-center font-mono text-3xl font-semibold tracking-[0.2em]"
                data-testid="pairing-code"
              >
                {groupCode(code)}
              </p>
              <p className="text-sm text-muted-foreground">{t("dev.pairLead")}</p>
              <p className="text-xs text-muted-foreground">{t("dev.pairNote")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(groupCode(code))
                      .then(() => toast.success(t("dev.copied")))
                      .catch(() => undefined)
                  }
                >
                  <Copy className="size-4" />
                  {t("dev.copy")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      setCode((await serverAccount.issuePairing()).code);
                    })
                  }
                >
                  <RefreshCw className="size-4" />
                  {t("dev.pairAgain")}
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              disabled={busy}
              className="h-auto w-full whitespace-normal py-2 sm:w-auto"
              onClick={() =>
                void work(async () => {
                  setCode((await serverAccount.issuePairing()).code);
                })
              }
            >
              {t("dev.pair")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
