import type { RecurrenceFrequency } from "@prisma/client";
import { addMonths, addWeeks, addYears, differenceInCalendarDays, isAfter, isBefore, startOfDay } from "date-fns";

export type RecurringScheduleInput = {
  nextDate: Date;
  frequency: RecurrenceFrequency;
  isActive: boolean;
};

export type RecurringScheduleStatus = {
  daysUntilNext: number;
  isDue: boolean;
  dueDates: Date[];
  nextDateAfterRun: Date;
};

export class RecurringTransactionService {
  getNextDate(date: Date, frequency: RecurrenceFrequency) {
    if (frequency === "WEEKLY") return addWeeks(date, 1);
    if (frequency === "YEARLY") return addYears(date, 1);
    return addMonths(date, 1);
  }

  getStatus(input: RecurringScheduleInput, today = new Date()): RecurringScheduleStatus {
    const normalizedToday = startOfDay(today);
    const normalizedNext = startOfDay(input.nextDate);
    const dueDates = input.isActive ? this.getDueDates(normalizedNext, input.frequency, normalizedToday) : [];

    return {
      daysUntilNext: differenceInCalendarDays(normalizedNext, normalizedToday),
      isDue: dueDates.length > 0,
      dueDates,
      nextDateAfterRun: dueDates.length > 0 ? this.getNextDate(dueDates[dueDates.length - 1], input.frequency) : normalizedNext
    };
  }

  getDueDates(nextDate: Date, frequency: RecurrenceFrequency, until = new Date(), maxOccurrences = 24) {
    const dates: Date[] = [];
    let cursor = startOfDay(nextDate);
    const end = startOfDay(until);

    while (!isAfter(cursor, end) && dates.length < maxOccurrences) {
      dates.push(cursor);
      cursor = this.getNextDate(cursor, frequency);
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
