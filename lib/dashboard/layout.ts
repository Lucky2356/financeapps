// Dashboard widget layout: which cards are shown and in what order. Stored as a
// per-device UI preference in localStorage (not financial data), so no schema
// change is needed and it stays consistent across web and desktop. The pure
// helpers below are unit-tested; storage access lives in the component.

export const DASHBOARD_WIDGETS = [
  "overview",
  "allowance",
  "watchdog",
  "forecast",
  "emergencyFund",
  "netWorth",
  "metrics",
  "charts"
] as const;

export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export type DashboardLayout = {
  order: DashboardWidget[];
  hidden: DashboardWidget[];
  /** Версия раскладки: 2 — «Можно тратить сегодня» уже снята с самого верха. */
  v?: number;
};

const LAYOUT_VERSION = 2;

// "metrics" is off by default: the overview grid at the top of the screen shows
// the same four figures, and two copies of the same numbers on one screen is
// noise. It stays one tap away in "Настроить" for anyone who wants the larger
// cards with their sparklines back.
export const DEFAULT_LAYOUT: DashboardLayout = {
  order: [...DASHBOARD_WIDGETS],
  hidden: ["metrics"],
  v: LAYOUT_VERSION
};

/** Поставить виджет сразу после сводки (или в конец, если сводки нет). */
function afterOverview(order: DashboardWidget[], widget: DashboardWidget): DashboardWidget[] {
  const rest = order.filter((item) => item !== widget);
  const at = rest.indexOf("overview");
  if (at < 0) return [...rest, widget];
  return [...rest.slice(0, at + 1), widget, ...rest.slice(at + 1)];
}

function isWidget(value: unknown): value is DashboardWidget {
  return typeof value === "string" && (DASHBOARD_WIDGETS as readonly string[]).includes(value);
}

// Reconciles a saved layout with the current widget set: keeps the saved order,
// appends any widgets added since it was saved, and drops unknown ones. This
// keeps old preferences valid when new dashboard widgets ship.
export function normalizeLayout(
  saved: Partial<DashboardLayout> | null | undefined
): DashboardLayout {
  if (!saved) return { order: [...DASHBOARD_WIDGETS], hidden: [], v: LAYOUT_VERSION };
  let order = Array.isArray(saved.order) ? saved.order.filter(isWidget) : [];
  // 2.2.0 ставила «Можно тратить сегодня» самой первой — над сводкой, крупно.
  // Это было некрасиво: главная начиналась не с денег. Один раз переносим её
  // за сводку; если человек потом сам поднимет её наверх — так и останется.
  if (saved.v !== LAYOUT_VERSION && order[0] === "allowance") {
    order = afterOverview(order, "allowance");
  }
  const seen = new Set(order);
  DASHBOARD_WIDGETS.forEach((widget, index) => {
    if (seen.has(widget)) return;
    // Новое у тех, кто настроил главную раньше, встаёт туда же, где оно в
    // порядке по умолчанию, — после своего соседа («Можно тратить сегодня» —
    // под сводкой, «Стоит проверить» — под ним). Соседа нет — в конец.
    const neighbour = [...DASHBOARD_WIDGETS.slice(0, index)]
      .reverse()
      .find((item) => order.includes(item));
    if (!neighbour) {
      order = [...order, widget];
    } else {
      const at = order.indexOf(neighbour);
      order = [...order.slice(0, at + 1), widget, ...order.slice(at + 1)];
    }
  });
  const hidden = Array.isArray(saved.hidden) ? saved.hidden.filter(isWidget) : [];
  return {
    order,
    hidden: hidden.filter((widget) => order.includes(widget)),
    v: LAYOUT_VERSION
  };
}

export function isHidden(layout: DashboardLayout, widget: DashboardWidget): boolean {
  return layout.hidden.includes(widget);
}

export function toggleWidget(layout: DashboardLayout, widget: DashboardWidget): DashboardLayout {
  const hidden = layout.hidden.includes(widget)
    ? layout.hidden.filter((item) => item !== widget)
    : [...layout.hidden, widget];
  return { ...layout, hidden };
}

// Moves a widget up (-1) or down (+1) within the order, clamped to the bounds.
export function moveWidget(
  layout: DashboardLayout,
  widget: DashboardWidget,
  direction: -1 | 1
): DashboardLayout {
  const order = [...layout.order];
  const index = order.indexOf(widget);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return layout;
  [order[index], order[target]] = [order[target], order[index]];
  return { ...layout, order };
}
