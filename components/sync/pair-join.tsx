"use client";

// Подключиться к устройству, где данные уже есть, — по картинке или по ссылке.
//
// На телефоне главный путь — камера: навёл и готово. На компьютере камеры
// обычно нет, поэтому рядом всегда поле для ссылки: первое устройство умеет её
// скопировать, а переслать себе ссылку в мессенджере умеет любой.

import { Camera } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { DEFAULT_SERVER } from "@/lib/sync/default-server";
import { cameraPossible, scanQr } from "@/lib/sync/scan-qr";
import { joinWithLink } from "@/lib/vault/runtime";

export function PairJoin({
  onJoined,
  onCancel
}: {
  /** Данные приняты. По умолчанию — перечитать приложение. */
  onJoined?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(raw: string) {
    setError(null);
    setBusy(true);
    try {
      await joinWithLink(raw, DEFAULT_SERVER);
      toast.success(t("sync2.join.done"));
      if (onJoined) onJoined();
      else {
        // Данные приехали в хранилище, а не на экран, — перечитать проще и
        // надёжнее, чем рассказывать о них каждому экрану по отдельности.
        await new Promise((resolve) => setTimeout(resolve, 600));
        window.location.reload();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className="space-y-4" data-testid="pair-join">
      <p className="text-sm text-muted-foreground">{t("sync2.join.lead")}</p>

      {cameraPossible() ? (
        <Button type="button" className="w-full" disabled={busy} onClick={() => void openCamera()}>
          <Camera className="size-4" />
          {t("sync2.join.camera")}
        </Button>
      ) : null}

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
