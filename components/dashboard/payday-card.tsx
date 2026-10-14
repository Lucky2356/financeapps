"use client";

// «Хватит ли до зарплаты» на главной (lib/analytics/payday.ts).

import { CalendarClock, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Expand } from "@/components/ui/expand";
import { PaydayPicker } from "@/components/dashboard/payday-picker";
import { paydayDate, paydayHeadline, paydayMoneyLine } from "@/components/dashboard/payday-text";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { PathWithQuery, ReadResponses } from "@/lib/api/routes";
import {
  parsePaydaySchedule,
  serializePaydaySchedule,
  type PaydaySchedule
} from "@/lib/analytics/payday";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { readMine, writeMine } from "@/lib/storage/mine";
import { cn } from "@/lib/utils";

/**
 * Когда приходит зарплата, если человек указал сам, — на этом устройстве.
 * Строка расписания (parsePaydaySchedule): «10,25», «week:5», «daily». До
 * расписаний здесь лежало одно число — «10», — и оно читается как есть.
 */
export const PAYDAY_KEY = "payday-day";

/** Путь чтения «до зарплаты» для указанного расписания (пусто — по истории). */
export function paydayPath(stored: string): PathWithQuery<"/payday"> {
  return stored ? `/payday?schedule=${encodeURIComponent(stored)}` : "/payday";
}

type PaydayData = ReadResponses["/payday"];

const NOTHING: PaydayData = { forecast: null, detected: null };

export function PaydayCard({ currency }: { currency: string }) {
  const { t, locale } = useI18n();
  // Перечитанное и пересохранённое: мусор или старое одно число становятся
  // правильной строкой расписания при первом же выборе.
  const [stored, setStored] = useState<string>(() =>
    serializePaydaySchedule(parsePaydaySchedule(readMine(PAYDAY_KEY)))
  );
  const [open, setOpen] = useState(false);
  // Пока считается новый выбор, показываем прежний ответ, а не пустоту: иначе
  // каждый щелчок по числу на кадр убирал бы карточку целиком вместе с выбором.
  const [shown, setShown] = useState<PaydayData>(NOTHING);
  const { data } = useApiPageData(shown, paydayPath(stored));
  if (data.forecast && data !== shown) setShown(data);
  const forecast = data.forecast;
  if (!forecast) return null;
  const money = (value: number) => formatCurrency(value, currency);

  function choose(next: PaydaySchedule | null) {
    const value = serializePaydaySchedule(next);
    writeMine(PAYDAY_KEY, value);
    setStored(value);
  }

  return (
    <Card
      data-testid="payday"
      className={cn(
        forecast.status === "short" && "border-destructive/50",
        forecast.status === "tight" && "border-warning/50"
      )}
    >
      <CardContent className="space-y-2 p-4">
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground" data-testid="payday-when">
              {paydayHeadline(
                forecast,
                locale,
                paydayDate(forecast.nextDate, locale, forecast.schedule.kind === "weekly")
              )}
            </span>
            <span
              className={cn(
                "block font-semibold",
                forecast.status === "short" && "text-destructive"
              )}
              data-testid={forecast.status === "short" ? "payday-short" : "payday-free"}
            >
              {paydayMoneyLine(forecast, locale, money)}
            </span>
            {forecast.status === "tight" ? (
              <span className="block text-xs text-muted-foreground">
                {t("pay.tight", { usual: money(forecast.usualPerDay) })}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn("mt-1 size-4 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
        <Expand open={open}>
          <div className="space-y-2 border-t pt-2 text-sm">
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("pay.liquid")}</span>
              <span className="tabular-nums">{money(forecast.liquid)}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("pay.upcoming")}</span>
              <span className="tabular-nums">
                {forecast.upcoming > 0 ? `−${money(forecast.upcoming)}` : money(0)}
              </span>
            </p>
            {forecast.payments.length > 0 ? (
              <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
                {forecast.payments.map((item, index) => (
                  <li key={`${item.date}-${index}`} className="flex justify-between gap-2">
                    <span className="truncate">
                      {paydayDate(item.date.slice(0, 10), locale)} · {item.title}
                    </span>
                    <span className="tabular-nums">{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="pt-1">
              <PaydayPicker
                value={parsePaydaySchedule(stored)}
                detected={data.detected}
                onChange={choose}
              />
            </div>
          </div>
        </Expand>
      </CardContent>
    </Card>
  );
}
