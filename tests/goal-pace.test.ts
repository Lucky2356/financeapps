import { describe, expect, it } from "vitest";

import { describeGoalPace } from "@/lib/goal-pace";

const now = new Date("2026-06-20T00:00:00.000Z");

describe("describeGoalPace", () => {
  it("reports months left for a future deadline", () => {
    const pace = describeGoalPace(
      { currentAmount: 20000, targetAmount: 100000, deadline: "2026-12-31" },
      now
    );
    expect(pace.isComplete).toBe(false);
    expect(pace.isOverdue).toBe(false);
    expect(pace.monthsLeft).toBe(6);
    expect(pace.hint).toBe("осталось 6 мес.");
  });

  it("marks a fully funded goal as complete regardless of deadline", () => {
    const pace = describeGoalPace(
      { currentAmount: 100000, targetAmount: 100000, deadline: "2020-01-01" },
      now
    );
    expect(pace.isComplete).toBe(true);
    expect(pace.isOverdue).toBe(false);
    expect(pace.hint).toBe("Цель достигнута");
  });

  it("flags an unmet goal past its deadline as overdue", () => {
    const pace = describeGoalPace(
      { currentAmount: 5000, targetAmount: 100000, deadline: "2026-01-01" },
      now
    );
    expect(pace.isOverdue).toBe(true);
    expect(pace.hint).toBe("Срок прошёл");
  });

  it("uses an 'this month' hint when the deadline is the current month", () => {
    const pace = describeGoalPace(
      { currentAmount: 5000, targetAmount: 100000, deadline: "2026-06-28" },
      now
    );
    expect(pace.monthsLeft).toBe(0);
    expect(pace.isOverdue).toBe(false);
    expect(pace.hint).toBe("в этом месяце");
  });
});
