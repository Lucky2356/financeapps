import { differenceInCalendarMonths, startOfDay } from "date-fns";

import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n/catalog";

export type GoalPace = {
  /** Whole calendar months left until the deadline (can be negative if overdue). */
  monthsLeft: number;
  isComplete: boolean;
  isOverdue: boolean;
  /** Short human-readable context shown next to the monthly contribution. */
  hint: string;
};

type GoalLike = {
  currentAmount: number;
  targetAmount: number;
  deadline: string | Date;
};

// Describes how a saving goal is pacing against its deadline. Pure helper so it
// can be reused by the goal card UI and covered by unit tests. The monthly
// contribution itself is computed server-side (ceil(remaining / monthsLeft));
// this only adds the surrounding context (months left / reached / overdue).
export function describeGoalPace(
  goal: GoalLike,
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE
): GoalPace {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const isComplete = remaining <= 0;
  const monthsLeft = differenceInCalendarMonths(new Date(goal.deadline), now);
  // Counted in calendar months, a deadline on the 5th is still "this month" on
  // the 20th — an expired goal read as achievable for up to four more weeks.
  const isOverdue = !isComplete && startOfDay(new Date(goal.deadline)) < startOfDay(now);

  let hint: string;
  if (isComplete) {
    hint = t("svc.goal.reached");
  } else if (isOverdue) {
    hint = t("svc.goal.overdue");
  } else if (monthsLeft <= 0) {
    hint = t("svc.goal.thisMonth");
  } else {
    hint = t("svc.goal.monthsLeft", { n: monthsLeft });
  }

  return { monthsLeft, isComplete, isOverdue, hint };
}
