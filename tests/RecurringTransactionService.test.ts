import { describe, expect, it } from "vitest";
import { format } from "date-fns";

import { RecurringTransactionService } from "@/services/RecurringTransactionService";

describe("RecurringTransactionService", () => {
  it("detects due monthly occurrences and advances to the next unpaid date", () => {
    const service = new RecurringTransactionService();
    const status = service.getStatus(
      {
        nextDate: new Date("2026-01-10"),
        frequency: "MONTHLY",
        isActive: true
      },
      new Date("2026-03-15")
    );

    expect(status.isDue).toBe(true);
    expect(status.dueDates.map((date) => format(date, "yyyy-MM-dd"))).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(format(status.nextDateAfterRun, "yyyy-MM-dd")).toBe("2026-04-10");
  });

  it("does not create due dates for inactive templates", () => {
    const service = new RecurringTransactionService();
    const status = service.getStatus(
      {
        nextDate: new Date("2026-01-10"),
        frequency: "WEEKLY",
        isActive: false
      },
      new Date("2026-01-20")
    );

    expect(status.isDue).toBe(false);
    expect(status.dueDates).toEqual([]);
  });
});
