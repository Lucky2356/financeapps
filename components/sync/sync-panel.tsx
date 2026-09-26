"use client";

// Синхронизация устройств — один раздел вместо двух.
//
// Прежде здесь были «Свой сервер» с четырьмя путями и «Мои устройства» с
// кодом из восьми знаков, а на втором устройстве человек вводил адрес, имя и
// пароль. Владелец, сидевший рядом со всей этой работой, не смог подключить
// телефон сам. Значит, это было неудобно не «новичку», а вообще.
//
// Теперь путей два и названы они тем, что человек делает:
//   * «Включить синхронизацию» — на устройстве, где данные уже есть. Запись на
//     службе заводится сама, и сразу показывается картинка для второго;
//   * «Подключиться к другому устройству» — на новом. Камера или ссылка.
// Имени, пароля и слов нет. Прежний вход по имени и паролю и своя служба —
// под «Дополнительно», для тех, кому они нужны.

import { Cloud, CloudOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DevicesPanel } from "@/components/settings/devices-panel";
import { SERVER_LINK_CHANGED, ServerPanel } from "@/components/settings/server-panel";
import { PairJoin } from "@/components/sync/pair-join";
import { PairOffer } from "@/components/sync/pair-offer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import { DEFAULT_SERVER, hasDefaultServer } from "@/lib/sync/default-server";
import { cameraPossible } from "@/lib/sync/scan-qr";
import { enableSync, forgetMyServer, serverAccount, stopSync } from "@/lib/vault/runtime";
import type { ServerLink } from "@/lib/vault/server-account";

type Mode = "idle" | "offer" | "scan" | "join";

export function SyncPanel() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [link, setLink] = useState<ServerLink | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  // Служба больше не узнаёт это устройство: билет погашен (устройство
  // выкинули с другого) или данные на службе стёрты. Запись о связи здесь при
  // этом осталась — и без проверки экран говорил бы «включена», а каждое
  // действие отвечало бы «нужен вход».
  const [lost, setLost] = useState(false);
  // Ссылка из QR, которой открыли приложение (IncomingLinkWatch): join — это
  // устройство подключается, answer — отвечает новому устройству своими данными.
  const params = useSearchParams();
  const joinLink = params.get("join") ?? undefined;
  const answerLink = params.get("answer") ?? undefined;

  const refresh = useCallback(async () => {
    setLink(await serverAccount.link());
    setReady(true);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await serverAccount.link();
      if (!alive) return;
      setLink(stored);
      setReady(true);
      if (stored && (await serverAccount.health()) === "lost" && alive) setLost(true);
    })();
    const changed = () => void refresh();
    window.addEventListener(SERVER_LINK_CHANGED, changed);
    return () => {
      alive = false;
      window.removeEventListener(SERVER_LINK_CHANGED, changed);
    };
  }, [refresh]);

  async function turnOn() {
    setBusy(true);
    try {
      await enableSync(DEFAULT_SERVER);
      await refresh();
      window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
      toast.success(t("sync2.on.done"));
      // Сразу — картинка для второго устройства: ради него синхронизацию и
      // включают. А если приложение открыли кодом нового устройства — ответить
      // на него.
      setMode(answerLink ? "scan" : "offer");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    const sure = await confirm({
      title: t("sync2.off.title"),
      description: t("sync2.off.desc"),
      confirmLabel: t("sync2.off.confirm")
    });
    if (!sure) return;
    setBusy(true);
    try {
      stopSync();
      await serverAccount.signOut();
      await forgetMyServer();
      await refresh();
      window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
      setMode("idle");
      toast.success(t("sync2.off.done"));
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Открыли ссылкой: сразу в нужный режим, без лишних нажатий. Через таймер —
  // смена режима не должна случаться прямо в теле эффекта.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      if (answerLink && link) setMode("scan");
      else if (joinLink && !link) setMode("join");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, link, joinLink, answerLink]);

  /** Связь потеряна: забыть её здесь и начать заново. Записи не трогаются. */
  async function reconnect() {
    setBusy(true);
    try {
      stopSync();
      await serverAccount.forgetHere();
      await forgetMyServer();
      setLost(false);
      setMode("idle");
      await refresh();
      window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <>
      <Card id="set-sync" className="scroll-mt-24" data-testid="sync-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {link ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
            {t("sync2.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("sync2.lead")}</p>

          {link && lost ? (
            <div
              className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3"
              data-testid="sync-lost"
            >
              <p className="text-sm font-medium">{t("sync2.lost.title")}</p>
              <p className="text-sm text-muted-foreground">{t("sync2.lost.desc")}</p>
              <Button type="button" disabled={busy} onClick={() => void reconnect()}>
                {t("sync2.lost.button")}
              </Button>
            </div>
          ) : link ? (
            <>
              <p className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="sync-on">
                {t("sync2.on.state", { device: link.device })}
              </p>
              {mode === "offer" || mode === "scan" ? (
                <PairOffer
                  mode={mode === "scan" ? "scan" : "show"}
                  onClose={() => setMode("idle")}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => setMode("offer")}>
                    {t("sync2.offer.button")}
                  </Button>
                  {/* Новый компьютер без камеры покажет свой код — снять его отсюда. */}
                  {cameraPossible() ? (
                    <Button type="button" variant="secondary" onClick={() => setMode("scan")}>
                      {t("sync2.scan.button")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void turnOff()}
                  >
                    {t("sync2.off.button")}
                  </Button>
                </div>
              )}
            </>
          ) : mode === "join" ? (
            <PairJoin initialLink={joinLink} onCancel={() => setMode("idle")} />
          ) : (
            <>
              {hasDefaultServer() ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void turnOn()}
                    className="rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <span className="block text-sm font-medium">{t("sync2.on.button")}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("sync2.on.hint")}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMode("join")}
                    className="rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <span className="block text-sm font-medium">{t("sync2.join.button")}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("sync2.join.hint")}
                    </span>
                  </button>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("sync2.safety")}</p>
            </>
          )}
        </CardContent>
      </Card>

      {link && !lost ? <DevicesPanel /> : null}

      {/* Прежние пути — для своей службы и для записи с именем и паролем. На
          виду им не место: обычному человеку они не нужны и только путают. */}
      {!link ? (
        <details
          className="group rounded-lg border bg-card"
          open={!hasDefaultServer() || undefined}
        >
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            {t("sync2.advanced")}
          </summary>
          <div className="px-2 pb-2">
            <ServerPanel />
          </div>
        </details>
      ) : null}
    </>
  );
}
