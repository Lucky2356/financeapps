import { describe, expect, it } from "vitest";

import { budgetResetMarker, goalDeadlineMarkers } from "@/lib/calendar/markers";

describe("goalDeadlineMarkers", () => {
  it("creates a marker per unfinished goal deadline", () => {
    const markers = goalDeadlineMarkers([
      { id: "g1", title: "Отпуск", deadline: "2026-08-01T00:00:00.000Z", progress: 40 },
      { id: "g2", title: "Подушка", deadline: "2026-12-31", progress: 100 }, // done → skipped
      { id: "g3", title: "Без даты", deadline: "", progress: 10 } // no date → skipped
    ]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: "goal", date: "2026-08-01", title: "Отпуск" });
  });
});

describe("budgetResetMarker", () => {
  it("marks the first of the given month", () => {
    const marker = budgetResetMarker(new Date(2026, 6, 15), "Сброс бюджетов");
    expect(marker).toMatchObject({
      kind: "budget-reset",
      date: "2026-07-01",
      title: "Сброс бюджетов"
    });
  });
});
