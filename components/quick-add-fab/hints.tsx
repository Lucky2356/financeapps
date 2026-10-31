"use client";

import type { limitHint } from "@/lib/budget-limit-hint";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { TripView } from "@/lib/trips/trips";
import { cn } from "@/lib/utils";

/** Форму заполнил черновик — и кнопка, чтобы начать заново. */
export function DraftBanner({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs"
      data-testid="qa-draft"
    >
      <span>{t("qa.draft.restored")}</span>
      <button type="button" className="shrink-0 font-medium underline" onClick={onDiscard}>
        {t("qa.draft.discard")}
      </button>
    </div>
  );
}

/** Сколько осталось в лимите категории — до траты, с уже набранной суммой. */
export function LimitHint({ note }: { note: NonNullable<ReturnType<typeof limitHint>> }) {
  const { t } = useI18n();
  return (
    <p
      className={cn("text-xs", note.kind === "over" ? "text-destructive" : "text-muted-foreground")}
      data-testid="limit-hint"
      data-kind={note.kind}
    >
      {t(
        note.kind === "over"
          ? note.typed
            ? "limit.willExceed"
            : "limit.exceeded"
          : note.typed
            ? "limit.willLeave"
            : "limit.left",
        {
          category: note.category,
          amount: formatCurrency(note.amount),
          limit: formatCurrency(note.limit)
        }
      )}
    </p>
  );
}

/** Какой картой выгоднее — по условиям кэшбэка месяца операции. */
export function CashbackHint({
  card,
  onSwitch
}: {
  card: { id: string; name: string; percent: number };
  onSwitch: (accountId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <p
      className="flex flex-wrap items-center gap-x-2 text-xs text-success"
      data-testid="cashback-hint"
    >
      {t("cashback.better", {
        card: card.name,
        percent: card.percent
      })}
      <button type="button" className="font-medium underline" onClick={() => onSwitch(card.id)}>
        {t("cashback.switch")}
      </button>
    </p>
  );
}

/** Идёт поездка: трата помечается её тегом, если не снять галочку. */
export function TripHint({
  trip,
  skipTrip,
  onSkipTripChange
}: {
  trip: TripView;
  skipTrip: boolean;
  onSkipTripChange: (skip: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <label
      className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs"
      data-testid="trip-hint"
    >
      <span>{t("trip.on", { name: trip.name, tag: trip.tag })}</span>
      <span className="flex shrink-0 items-center gap-1">
        <input
          type="checkbox"
          className="size-4 accent-[hsl(var(--primary))]"
          checked={skipTrip}
          onChange={(event) => onSkipTripChange(event.target.checked)}
        />
        {t("trip.skip")}
      </span>
      {skipTrip ? <input type="hidden" name="noTrip" value="1" /> : null}
    </label>
  );
}

/**
 * Набранное и сохранённое здесь расходятся: сумма, дата, теги и слово счёта
 * разошлись по своим полям. Сказать об этом прямо честнее, чем тихо сохранить
 * не то, что видно.
 */
export function CleanedDescriptionNote({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <p className="text-xs text-muted-foreground" data-testid="qa-cleaned">
      {text ? t("qa.parsed.willSave", { text }) : t("qa.parsed.willSaveEmpty")}
    </p>
  );
}
