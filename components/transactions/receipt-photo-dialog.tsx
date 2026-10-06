"use client";

// Фото чека у операции: снять камерой или выбрать из галереи, посмотреть,
// заменить, удалить. Фото сжимается здесь же, на устройстве
// (lib/photos/compress.ts), и хранится отдельной записью, а не в операции.

import { Camera, ImageOff, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { compressPhoto } from "@/lib/photos/compress";
import { readMine, writeMine } from "@/lib/storage/mine";

export const PHOTO_DEVICE_ONLY_KEY = "receipt-photos-device-only";

type PhotoAnswer = { photo: string | null; place: "synced" | "device" | null; missing: boolean };

export function ReceiptPhotoDialog({
  transactionId,
  onClose,
  onChanged
}: {
  /** null — окно закрыто. */
  transactionId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [answer, setAnswer] = useState<PhotoAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceOnly, setDeviceOnly] = useState(false);

  useEffect(() => {
    if (!transactionId) return;
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setAnswer(null);
      setDeviceOnly(readMine(PHOTO_DEVICE_ONLY_KEY) === "1");
    });
    apiClient
      .get(`/photos?id=${encodeURIComponent(transactionId)}`)
      .then((result) => {
        if (alive) setAnswer(result);
      })
      .catch(() => {
        if (alive) setAnswer({ photo: null, place: null, missing: false });
      });
    return () => {
      alive = false;
    };
  }, [transactionId]);

  async function pick(file: File | undefined) {
    if (!file || !transactionId) return;
    setBusy(true);
    try {
      const photo = await compressPhoto(file);
      await apiClient.post("/photos", {
        transactionId,
        ...photo,
        place: deviceOnly ? "device" : "synced"
      });
      setAnswer({ photo: photo.data, place: deviceOnly ? "device" : "synced", missing: false });
      toast.success(t("photo.saved"));
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!transactionId) return;
    setBusy(true);
    try {
      await apiClient.delete(`/photos?id=${encodeURIComponent(transactionId)}`);
      setAnswer({ photo: null, place: null, missing: false });
      toast.success(t("photo.removed"));
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleDeviceOnly(next: boolean) {
    setDeviceOnly(next);
    writeMine(PHOTO_DEVICE_ONLY_KEY, next ? "1" : "0");
  }

  const hasPhoto = Boolean(answer?.photo);

  return (
    <Dialog open={transactionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("photo.title")}</DialogTitle>
          <DialogDescription>{t("photo.desc")}</DialogDescription>
        </DialogHeader>

        {answer === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasPhoto ? (
          // Чек длинный — прокручивается внутри окна, а не растягивает его.
          <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={answer.photo ?? ""}
              alt={t("photo.title")}
              className="w-full"
              data-testid="receipt-photo"
            />
          </div>
        ) : answer.missing ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <ImageOff className="mt-0.5 size-4 shrink-0" />
            {t("photo.elsewhere")}
          </p>
        ) : null}

        <input
          ref={input}
          type="file"
          // Без capture: телефон сам предложит «Камера» или «Галерея».
          accept="image/*"
          className="sr-only"
          data-testid="receipt-photo-input"
          onChange={(event) => void pick(event.target.files?.[0])}
        />

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
            checked={deviceOnly}
            onChange={(event) => toggleDeviceOnly(event.target.checked)}
          />
          <span>
            {t("photo.deviceOnly")}
            <span className="block text-xs text-muted-foreground">{t("photo.deviceOnlyHint")}</span>
          </span>
        </label>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {hasPhoto ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-4 text-destructive" />
              {t("photo.remove")}
            </Button>
          ) : null}
          <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            {busy ? t("photo.working") : hasPhoto ? t("photo.replace") : t("photo.take")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
