"use client";

// Картинка для нового устройства — на том, где данные уже есть.
//
// Человек видит одно: код на экране и подсказку, что с ним сделать. Всё
// остальное — ключ от данных, одноразовый ключ пакета, код службы — собрано в
// картинку за него. Пока картинка на экране, приложение само смотрит в список
// устройств и говорит, когда новое подключилось: иначе человек не знает,
// сработало ли, и нажимает «ещё раз».
//
// ИЛИ НАОБОРОТ. У нового компьютера камеры нет — тогда код показывает он, а
// здесь, на телефоне с данными, его снимают (режим "scan", обратная связка).

import { Camera, Check, Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SERVER_LINK_CHANGED } from "@/components/settings/server-panel";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PairingQr } from "@/components/vault/pairing-qr";
import { useI18n } from "@/lib/i18n/context";
import { cameraPossible, scanQr } from "@/lib/sync/scan-qr";
import {
  accountService,
  answerPairingRequest,
  offerPairing,
  serverAccount,
  type PairingOffer
} from "@/lib/vault/runtime";

/** Как часто спрашивать службу, не подключилось ли новое устройство. */
const POLL_MS = 3000;

export function PairOffer({
  onClose,
  mode = "show"
}: {
  onClose: () => void;
  /** show — показать свой код; scan — снять код нового устройства. */
  mode?: "show" | "scan";
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [answered, setAnswered] = useState(false);
  const [needPassword, setNeedPassword] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [offer, setOffer] = useState<PairingOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const known = useRef<Set<string>>(new Set());
  // Пароль, если его спросили: «Новый код» не должен спрашивать его снова.
  const remembered = useRef<string | undefined>(undefined);

  const make = useCallback(async (entered?: string) => {
    const secret = entered ?? remembered.current;
    setBusy(true);
    setError(null);
    try {
      const list = await serverAccount.devices();
      known.current = new Set(list.devices.map((device) => device.id));
      const made = await offerPairing(secret);
      remembered.current = secret;
      setLeft(Math.max(0, Math.round((Date.parse(made.expiresAt) - Date.now()) / 1000)));
      setOffer(made);
      setNeedPassword(false);
      setPassword("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  /** Снять код нового устройства и ответить на него своими данными. */
  const scanNew = useCallback(async () => {
    setError(null);
    const shot = await scanQr();
    if (!shot.ok) {
      if (shot.why !== "cancelled") {
        setError(
          shot.why === "denied"
            ? t("server.cameraDenied")
            : shot.why === "absent"
              ? t("server.cameraAbsent")
              : t("server.cameraBroken")
        );
      }
      return;
    }
    // Данные уходят тому, чей код сняли. Спросить — дёшево; снять чужой код
    // по ошибке или по чьей-то просьбе — нет.
    const sure = await confirm({
      title: t("sync2.scan.confirmTitle"),
      description: t("sync2.scan.confirmDesc"),
      confirmLabel: t("sync2.scan.confirm")
    });
    if (!sure) return;
    setBusy(true);
    try {
      const list = await serverAccount.devices();
      known.current = new Set(list.devices.map((device) => device.id));
      await answerPairingRequest(shot.text, remembered.current);
      setAnswered(true);
      toast.success(t("sync2.scan.sent"));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [confirm, t]);

  /** Пароль спросили: проверить его сразу, а не после съёмки. */
  const acceptPassword = useCallback(
    async (entered: string) => {
      if (mode === "show") return make(entered);
      setBusy(true);
      setError(null);
      try {
        await accountService.pairingPackage(entered);
        remembered.current = entered;
        setNeedPassword(false);
        setPassword("");
      } catch (cause) {
        setError((cause as Error).message);
        return;
      } finally {
        setBusy(false);
      }
      await scanNew();
    },
    [make, mode, scanNew]
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const needs = await accountService.pairingNeedsPassword();
      if (!alive) return;
      setNeedPassword(needs);
      if (needs) return;
      // Человек нажал «Сканировать» — камеру открываем сразу.
      if (mode === "scan") await scanNew();
      else await make();
    })();
    return () => {
      alive = false;
    };
  }, [make, mode, scanNew]);

  // Ждём новое устройство, пока код жив, — или после ответа на его код.
  useEffect(() => {
    if ((!offer && !answered) || joined) return;
    const timer = window.setInterval(() => {
      if (offer) {
        const remaining = Math.max(
          0,
          Math.round((Date.parse(offer.expiresAt) - Date.now()) / 1000)
        );
        setLeft(remaining);
        if (remaining === 0 && !answered) return;
      }
      void serverAccount
        .devices()
        .then((list) => {
          const fresh = list.devices.find((device) => !known.current.has(device.id));
          if (!fresh) return;
          setJoined(fresh.name);
          window.dispatchEvent(new Event(SERVER_LINK_CHANGED));
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [offer, answered, joined]);

  if (joined) {
    return (
      <div className="space-y-3 rounded-lg border p-4" data-testid="pair-joined">
        <p className="flex items-center gap-2 font-medium">
          <Check className="size-5 text-success" />
          {t("sync2.offer.joined", { name: joined })}
        </p>
        <p className="text-sm text-muted-foreground">{t("sync2.offer.joinedNote")}</p>
        <Button type="button" onClick={onClose}>
          {t("sync2.done")}
        </Button>
      </div>
    );
  }

  if (needPassword) {
    return (
      <form
        className="space-y-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void acceptPassword(password);
        }}
      >
        <p className="text-sm text-muted-foreground">{t("sync2.offer.passwordLead")}</p>
        <div className="space-y-2">
          <Label htmlFor="pair-password">{t("sync2.offer.password")}</Label>
          <Input
            id="pair-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {t("sync2.offer.show")}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("sync2.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  const expired = offer !== null && left === 0;

  if (mode === "scan") {
    return (
      <div className="space-y-3 rounded-lg border p-4" data-testid="pair-scan">
        <p className="text-sm text-muted-foreground">
          {answered ? t("sync2.scan.sent") : t("sync2.scan.hint")}
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          {cameraPossible() && !answered ? (
            <Button type="button" disabled={busy} onClick={() => void scanNew()}>
              <Camera className="size-4" />
              {t("sync2.scan.button")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("sync2.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-4 rounded-lg border p-4"
      data-testid="pair-offer"
      data-link={offer && !expired ? offer.link : undefined}
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>{t("sync2.offer.step1")}</li>
        <li>{t("sync2.offer.step2")}</li>
        <li>{t("sync2.offer.step3")}</li>
      </ol>

      {offer && !expired ? (
        <div className="flex flex-col items-center gap-2">
          <PairingQr value={offer.link} size={240} />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t("sync2.offer.waiting", { time: `${minutes}:${seconds}` })}
          </p>
        </div>
      ) : expired ? (
        <p className="text-sm text-muted-foreground">{t("sync2.offer.expired")}</p>
      ) : busy ? (
        <p className="text-sm text-muted-foreground">{t("sync2.offer.making")}</p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Новое устройство — компьютер без камеры? Тогда код показывает он. */}
      {cameraPossible() ? (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{t("sync2.scan.hint")}</p>
          <Button type="button" className="w-full" disabled={busy} onClick={() => void scanNew()}>
            <Camera className="size-4" />
            {t("sync2.scan.button")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {offer && !expired ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(offer.link)
                .then(() => toast.success(t("sync2.offer.copied")))
                .catch(() => undefined)
            }
          >
            <Copy className="size-4" />
            {t("sync2.offer.copy")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={() => void make()}>
          <RefreshCw className="size-4" />
          {t("sync2.offer.again")}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("sync2.cancel")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("sync2.offer.note")}</p>
    </div>
  );
}
