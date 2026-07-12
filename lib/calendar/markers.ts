// Non-cashflow calendar markers — goal deadlines, budget resets, expected
// dividends — that overlay the forecast cashflow calendar to make it a single
// financial calendar. Pure helpers; the UI supplies localized titles for the
// kind-based markers (budget reset), while goal/dividend markers carry their own.

export type CalendarMarkerKind = "goal" | "budget-reset" | "dividend";

export type CalendarMarker = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  kind: CalendarMarkerKind;
  title: string;
  amount?: number;
};

export type MarkerGoal = {
  id: string;
  title: string;
  deadline: string;
  progress?: number;
};

// One marker per not-yet-reached goal deadline.
export function goalDeadlineMarkers(goals: MarkerGoal[]): CalendarMarker[] {
  return goals
    .filter((goal) => goal.deadline && (goal.progress ?? 0) < 100)
    .map((goal) => ({
      id: `goal-${goal.id}`,
      date: goal.deadline.slice(0, 10),
      kind: "goal" as const,
      title: goal.title
    }));
}

// A budget-reset marker on the 1st of the given month.
export function budgetResetMarker(monthDate: Date, title: string): CalendarMarker {
  const year = monthDate.getFullYear();
  const month = String(monthDate.getMonth() + 1).padStart(2, "0");
  return {
    id: `budget-reset-${year}-${month}`,
    date: `${year}-${month}-01`,
    kind: "budget-reset",
    title
  };
}
