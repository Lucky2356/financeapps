"use client";

// Картинка НОВОГО устройства — обратная связка.
//
// Прямая связка просит камеру у нового устройства: оно снимает код с экрана
// старого. Но новым чаще оказывается компьютер — человек начал на телефоне, а
// потом захотел и на ПК, — и снимать компьютеру нечем. Тогда код показывает
// он, а снимает телефон с данными. Этот экран — сторона компьютера: показать
// код, ждать ответа, по ответу забрать данные.

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PairingQr } from "@/components/vault/pairing-qr";
import { useI18n } from "@/lib/i18n/context";
import { checkPairingRequest, requestPairing, type PairingRequest } from "@/lib/vault/runtime";

/** Как часто спрашивать службу, ответил ли телефон. */
const POLL_MS = 2000;

export function PairWait({ base, onJoined }: { base: string; onJoined: () => void }) {
  const { t } = useI18n();
  const [request, setRequest] = useState<PairingRequest | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Подключились — больше не спрашивать: билет погашен, и следующий опрос до
  // перезагрузки показал бы «код не найден» поверх успеха.
  const [done, setDone] = useState(false);
  // Один опрос за раз: медленный ответ службы не должен наслаиваться на
  // следующий и дважды принимать один и тот же пакет.
  const asking = useRef(false);

  const make = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRequest(await requestPairing(base));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [base]);

  // Первый код — сразу, как экран открылся: ради него сюда и пришли.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const made = await requestPairing(base);
        if (alive) setRequest(made);
      } catch (cause) {
        if (alive) setError((cause as Error).message);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [base]);

  useEffect(() => {
    if (!request || done) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.round((Date.parse(request.expiresAt) - Date.now()) / 1000)
      );
      setLeft(remaining);
      if (remaining === 0 || asking.current) return;
      asking.current = true;
      void checkPairingRequest(request)
        .then((joined) => {
          if (!joined) return;
          setDone(true);
          onJoined();
        })
        .catch((cause: Error) => {
          setError(cause.message);
          setRequest(null);
        })
        .finally(() => {
          asking.current = false;
        });
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [request, done, onJoined]);

  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  const expired = request !== null && left === 0;

  if (done) {
    return (
      <p className="rounded-lg border p-4 text-sm" data-testid="pair-wait-done">
        {t("sync2.join.done")}
      </p>
    );
  }

  return (
    <div
      className="space-y-3 rounded-lg border p-4"
      data-testid="pair-wait"
      data-link={request && !expired ? request.link : undefined}
    >
      <p className="text-sm">{t("sync2.wait.lead")}</p>
      {request && !expired ? (
        <div className="flex flex-col items-center gap-2">
          <PairingQr value={request.link} size={240} />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t("sync2.wait.waiting", { time: `${minutes}:${seconds}` })}
          </p>
        </div>
      ) : expired ? (
        <p className="text-sm text-muted-foreground">{t("sync2.wait.expired")}</p>
      ) : busy ? (
        <p className="text-sm text-muted-foreground">{t("sync2.wait.making")}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {expired || error ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void make()}>
          <RefreshCw className="size-4" />
          {t("sync2.offer.again")}
        </Button>
      ) : null}
    </div>
  );
}
