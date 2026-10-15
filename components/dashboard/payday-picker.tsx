"use client";

// Когда приходит зарплата — выбор в карточке «До зарплаты».
//
// Одного числа мало: аванс 10-го и зарплата 25-го, каждая пятница, каждый
// день. Четыре варианта — по истории, числа месяца, раз в неделю, каждый день;
// у чисел — сетка 1–31 и «последний день», у недели — семь дней.
//
// Внутри — настоящие флажки и радиокнопки, спрятанные под плашки: Tab, пробел
// и стрелки работают сами, а программа чтения с экрана слышит «10-го числа,
// флажок, отмечен», а не «кнопка 10».

import { useId, useState, type ReactNode } from "react";

import { normalizeDays, type PaydayDay, type PaydaySchedule } from "@/lib/analytics/payday";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { describePaydaySchedule } from "@/components/dashboard/payday-text";

type Mode = "auto" | PaydaySchedule["kind"];

const MODES: Mode[] = ["auto", "monthly", "weekly", "daily"];
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
/** Раз в неделю чаще всего платят в пятницу — с неё и начинаем. */
const DEFAULT_WEEKDAY = 5;

/** Плашка над спрятанным флажком или радиокнопкой. */
function Chip({
  type,
  name,
  checked,
  onChange,
  label,
  className,
  children,
  testId
}: {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: () => void;
  label?: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <label
      data-testid={testId}
      className={cn(
        "relative flex min-h-9 cursor-pointer select-none items-center justify-center rounded-md border px-2 text-sm tabular-nums transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted",
        className
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="sr-only"
      />
      {children}
    </label>
  );
}

export function PaydayPicker({
  value,
  detected,
  onChange
}: {
  /** Указанное человеком; null — по истории. */
  value: PaydaySchedule | null;
  /** Дни, угаданные по истории, — для подсказки и как начало выбора чисел. */
  detected: number[] | null;
  onChange: (next: PaydaySchedule | null) => void;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const [mode, setMode] = useState<Mode>(value?.kind ?? "auto");
  const [days, setDays] = useState<PaydayDay[]>(
    value?.kind === "monthly" ? value.days : (detected ?? [])
  );
  const [weekday, setWeekday] = useState(
    value?.kind === "weekly" ? value.weekday : DEFAULT_WEEKDAY
  );

  // Ни одного отмеченного числа — расписания нет, считается по истории; так
  // и сказано под сеткой, а не молча.
  const monthly = (next: PaydayDay[]): PaydaySchedule | null =>
    next.length > 0 ? { kind: "monthly", days: next } : null;

  function pickMode(next: Mode) {
    setMode(next);
    if (next === "auto") onChange(null);
    else if (next === "monthly") onChange(monthly(days));
    else if (next === "weekly") onChange({ kind: "weekly", weekday });
    else onChange({ kind: "daily" });
  }

  function toggleDay(day: PaydayDay) {
    const next = normalizeDays(
      days.includes(day) ? days.filter((item) => item !== day) : [...days, day]
    );
    setDays(next);
    onChange(monthly(next));
  }

  function pickWeekday(next: number) {
    setWeekday(next);
    onChange({ kind: "weekly", weekday: next });
  }

  return (
    <div className="space-y-3" data-testid="payday-picker">
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-muted-foreground">{t("pay.day")}</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
          {MODES.map((item) => (
            <Chip
              key={item}
              type="radio"
              name={`${id}-mode`}
              checked={mode === item}
              onChange={() => pickMode(item)}
              className="sm:px-3"
            >
              {t(`pay.mode.${item}`)}
            </Chip>
          ))}
        </div>
      </fieldset>

      {mode === "auto" ? (
        <p className="text-xs text-muted-foreground">
          {detected
            ? t("pay.autoHint", {
                schedule: describePaydaySchedule({ kind: "monthly", days: detected }, locale)
              })
            : t("pay.autoUnknown")}
        </p>
      ) : null}

      {mode === "monthly" ? (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-xs text-muted-foreground">{t("pay.pickDays")}</legend>
          <div className="grid max-w-sm grid-cols-7 gap-1">
            {DAYS.map((day) => (
              <Chip
                key={day}
                type="checkbox"
                name={`${id}-day`}
                checked={days.includes(day)}
                onChange={() => toggleDay(day)}
                label={t("pay.dayN", { day })}
                className="px-0"
              >
                {day}
              </Chip>
            ))}
            {/* 31 клетка — четыре полных ряда и три в пятом; «последний день»
                занимает остаток ряда. */}
            <Chip
              type="checkbox"
              name={`${id}-day`}
              checked={days.includes("last")}
              onChange={() => toggleDay("last")}
              label={t("pay.lastDayFull")}
              className="col-span-4 px-1 text-xs sm:text-sm"
              testId="payday-last"
            >
              {t("pay.lastDayChip")}
            </Chip>
          </div>
          <p className="text-xs text-muted-foreground">
            {days.length > 0 ? t("pay.clampHint") : t("pay.pickOne")}
          </p>
        </fieldset>
      ) : null}

      {mode === "weekly" ? (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-xs text-muted-foreground">{t("pay.pickWeekday")}</legend>
          <div className="grid max-w-sm grid-cols-7 gap-1">
            {WEEKDAYS.map((item) => (
              <Chip
                key={item}
                type="radio"
                name={`${id}-weekday`}
                checked={weekday === item}
                onChange={() => pickWeekday(item)}
                label={t(`pay.everyWeekday.${item}`)}
                className="px-0"
              >
                {t(`pay.wd.${item}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      {mode === "daily" ? (
        <p className="text-xs text-muted-foreground">{t("pay.dailyHint")}</p>
      ) : null}
    </div>
  );
}
