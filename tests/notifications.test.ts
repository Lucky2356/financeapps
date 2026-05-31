import { describe, expect, it } from "vitest";

import { buildNotifications, countUrgent } from "@/lib/notifications";
import type { BudgetRow, ForecastEvent } from "@/types/finance";

const now = new Date("2026-06-01T12:00:00");

function expense(id: string, date: string, amount = 1000): ForecastEvent {
  return { id, date, title: `Платёж ${id}`, amount, type: "EXPENSE", category: "ЖКХ", account: "Карта" };
}

describe("buildNotifications", () => {
  it("flags exceeded budgets as warnings", () => {
    const budgets = [
      { categoryId: "cat-food", category: "Продукты", spent: 1500, limitAmount: 1000, isExceeded: true },
      { categoryId: "cat-transport", category: "Транспорт", spent: 200, limitAmount: 1000, isExceeded: false }
    ] as unknown as BudgetRow[];

    const items = buildNotifications({ budgets, now });
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("Продукты");
    expect(items[0].severity).toBe("WARNING");
  });

  it("includes upcoming expenses within 7 days and rates the imminent ones higher", () => {
    const items = buildNotifications({
      upcomingEvents: [
        expense("soon", "2026-06-02"), // 1 day → WARNING
        expense("later", "2026-06-06"), // 5 days → INFO
        expense("far", "2026-06-20"), // out of window
        { ...expense("inc", "2026-06-02"), type: "INCOME" } // income ignored
      ],
      now
    });

    const soon = items.find((item) => item.id === "due-soon");
    const later = items.find((item) => item.id === "due-later");
    expect(soon?.severity).toBe("WARNING");
    expect(later?.severity).toBe("INFO");
    expect(items.find((item) => item.id === "due-far")).toBeUndefined();
    expect(items.find((item) => item.id === "due-inc")).toBeUndefined();
  });

  it("counts only warnings and criticals as urgent", () => {
    const items = buildNotifications({
      recommendations: [
        { id: "a", title: "A", description: "", severity: "INFO" },
        { id: "b", title: "B", description: "", severity: "CRITICAL" }
      ],
      now
    });
    expect(countUrgent(items)).toBe(1);
  });
});
