import type { RecurrenceFrequency } from "@/types/enums";
import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  isAfter,
  isBefore,
  startOfDay
} from "date-fns";

export type RecurringScheduleInput = {
  nextDate: Date;
  frequency: RecurrenceFrequency;
  isActive: boolean;
  /** Число месяца, на которое платёж назначен (см. `anchorDayOf`). */
  anchorDay?: number;
};

/**
 * Число месяца, на которое назначен платёж.
 *
 * Следующая дата считалась от предыдущей: 31 января + месяц = 28 февраля, а
 * 28 февраля + месяц = 28 марта — и дальше навсегда 28-е. Зарплата или аренда
 * «в последний день» после первого же февраля переезжала на 28-е, вместе с
 * прогнозом и календарём. Теперь число запоминается у шаблона (`dayOfMonth`),
 * а у старых шаблонов берётся из их следующей даты.
 */
export function anchorDayOf(item: { nextDate: string; dayOfMonth?: number }): number {
  if (item.dayOfMonth && item.dayOfMonth >= 1 && item.dayOfMonth <= 31) return item.dayOfMonth;
  return new Date(item.nextDate).getDate();
}

/** Число месяца из того, что ввели в форму («2026-01-31») или сохранили. */
export function dayOfMonthFrom(value: string): number {
  const plain = /^\d{4}-\d{2}-(\d{2})$/.exec(value.trim());
  return plain ? Number(plain[1]) : new Date(value).getDate();
}

export type RecurringScheduleStatus = {
  daysUntilNext: number;
  isDue: boolean;
  dueDates: Date[];
  nextDateAfterRun: Date;
};

export class RecurringTransactionService {
  getNextDate(date: Date, frequency: RecurrenceFrequency, anchorDay?: number) {
    if (frequency === "WEEKLY") return addWeeks(date, 1);
    const next = frequency === "YEARLY" ? addYears(date, 1) : addMonths(date, 1);
    if (!anchorDay) return next;
    // Вернуться к своему числу, как только месяц его вмещает: 28 февраля →
    // 31 марта, а не 28-е. В коротком месяце — его последний день.
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    return new Date(next.getFullYear(), next.getMonth(), Math.min(anchorDay, lastDay));
  }

  getStatus(input: RecurringScheduleInput, today = new Date()): RecurringScheduleStatus {
    const normalizedToday = startOfDay(today);
    const normalizedNext = startOfDay(input.nextDate);
    const dueDates = input.isActive
      ? this.getDueDates(normalizedNext, input.frequency, normalizedToday, 24, input.anchorDay)
      : [];

    return {
      daysUntilNext: differenceInCalendarDays(normalizedNext, normalizedToday),
      isDue: dueDates.length > 0,
      dueDates,
      nextDateAfterRun:
        dueDates.length > 0
          ? this.getNextDate(dueDates[dueDates.length - 1], input.frequency, input.anchorDay)
          : normalizedNext
    };
  }

  getDueDates(
    nextDate: Date,
    frequency: RecurrenceFrequency,
    until = new Date(),
    maxOccurrences = 24,
    anchorDay?: number
  ) {
    const dates: Date[] = [];
    let cursor = startOfDay(nextDate);
    const end = startOfDay(until);

    while (!isAfter(cursor, end) && dates.length < maxOccurrences) {
      dates.push(cursor);
      cursor = this.getNextDate(cursor, frequency, anchorDay);
    }

    return dates;
  }

  sortUpcoming<T extends { nextDate: string | Date; isActive: boolean }>(items: T[]) {
    return [...items].sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return new Date(left.nextDate).getTime() - new Date(right.nextDate).getTime();
    });
  }

  isUpcomingSoon(nextDate: Date, today = new Date(), windowDays = 7) {
    const days = differenceInCalendarDays(startOfDay(nextDate), startOfDay(today));
    return days >= 0 && days <= windowDays;
  }

  isOverdue(nextDate: Date, today = new Date()) {
    return isBefore(startOfDay(nextDate), startOfDay(today));
  }
}
