import { differenceInCalendarMonths } from "date-fns";

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
export function describeGoalPace(goal: GoalLike, now: Date = new Date()): GoalPace {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const isComplete = remaining <= 0;
  const monthsLeft = differenceInCalendarMonths(new Date(goal.deadline), now);
  const isOverdue = !isComplete && monthsLeft < 0;

  let hint: string;
  if (isComplete) {
    hint = "Цель достигнута";
  } else if (isOverdue) {
    hint = "Срок прошёл";
  } else if (monthsLeft <= 0) {
    hint = "в этом месяце";
  } else {
    hint = `осталось ${monthsLeft} мес.`;
  }

  return { monthsLeft, isComplete, isOverdue, hint };
}
