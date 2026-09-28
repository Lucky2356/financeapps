import { describe, expect, it } from "vitest";

import {
  DASHBOARD_WIDGETS,
  moveWidget,
  normalizeLayout,
  toggleWidget,
  type DashboardLayout
} from "@/lib/dashboard/layout";

describe("normalizeLayout", () => {
  it("returns the default order when nothing is saved", () => {
    expect(normalizeLayout(null).order).toEqual([...DASHBOARD_WIDGETS]);
  });

  it("appends new widgets missing from a saved order", () => {
    const layout = normalizeLayout({ order: ["charts", "metrics"], hidden: [] });
    // Свой порядок сохранён, новое — после.
    expect(layout.order.slice(0, 2)).toEqual(["charts", "metrics"]);
    // every known widget is present exactly once
    expect(new Set(layout.order).size).toBe(DASHBOARD_WIDGETS.length);
  });

  it("«Можно тратить сегодня» по умолчанию — под сводкой, а не над ней", () => {
    expect(DASHBOARD_WIDGETS.slice(0, 2)).toEqual(["overview", "allowance"]);
    const layout = normalizeLayout({ order: ["charts", "overview", "forecast"], hidden: [] });
    expect(layout.order.slice(0, 3)).toEqual(["charts", "overview", "allowance"]);
  });

  it("раскладку из 2.2.0 с «Можно тратить» наверху один раз переносит за сводку", () => {
    const old = normalizeLayout({
      order: ["allowance", "overview", "forecast", "charts"] as never,
      hidden: []
    });
    expect(old.order.slice(0, 3)).toEqual(["overview", "allowance", "forecast"]);
    // Человек сам поднял её наверх уже в новой версии — так и остаётся.
    const chosen = normalizeLayout({
      ...old,
      order: ["allowance", ...old.order.slice(0, 1), ...old.order.slice(2)]
    });
    expect(chosen.order[0]).toBe("allowance");
  });

  it("drops unknown widgets and hidden entries not in the order", () => {
    const layout = normalizeLayout({
      order: ["charts", "bogus"] as never,
      hidden: ["overview", "bogus"] as never
    });
    expect(layout.order).not.toContain("bogus");
    expect(layout.hidden).toEqual(["overview"]);
  });
});

describe("toggleWidget", () => {
  it("hides then shows a widget", () => {
    const base: DashboardLayout = { order: [...DASHBOARD_WIDGETS], hidden: [] };
    const hidden = toggleWidget(base, "metrics");
    expect(hidden.hidden).toContain("metrics");
    const shown = toggleWidget(hidden, "metrics");
    expect(shown.hidden).not.toContain("metrics");
  });
});

describe("moveWidget", () => {
  it("moves a widget up and down", () => {
    const base: DashboardLayout = {
      order: ["overview", "forecast", "metrics"] as never,
      hidden: []
    };
    expect(moveWidget(base, "forecast", -1).order).toEqual(["forecast", "overview", "metrics"]);
    expect(moveWidget(base, "forecast", 1).order).toEqual(["overview", "metrics", "forecast"]);
  });

  it("does not move past the bounds", () => {
    const base: DashboardLayout = { order: ["overview", "forecast"] as never, hidden: [] };
    expect(moveWidget(base, "overview", -1).order).toEqual(["overview", "forecast"]);
    expect(moveWidget(base, "forecast", 1).order).toEqual(["overview", "forecast"]);
  });
});
