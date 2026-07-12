// Dashboard widget layout: which cards are shown and in what order. Stored as a
// per-device UI preference in localStorage (not financial data), so no schema
// change is needed and it stays consistent across web and desktop. The pure
// helpers below are unit-tested; storage access lives in the component.

export const DASHBOARD_WIDGETS = [
  "overview",
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
};

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: [...DASHBOARD_WIDGETS],
  hidden: []
};

function isWidget(value: unknown): value is DashboardWidget {
  return typeof value === "string" && (DASHBOARD_WIDGETS as readonly string[]).includes(value);
}

// Reconciles a saved layout with the current widget set: keeps the saved order,
// appends any widgets added since it was saved, and drops unknown ones. This
// keeps old preferences valid when new dashboard widgets ship.
export function normalizeLayout(
  saved: Partial<DashboardLayout> | null | undefined
): DashboardLayout {
  if (!saved) return { order: [...DASHBOARD_WIDGETS], hidden: [] };
  const savedOrder = Array.isArray(saved.order) ? saved.order.filter(isWidget) : [];
  const seen = new Set(savedOrder);
  const order = [...savedOrder, ...DASHBOARD_WIDGETS.filter((widget) => !seen.has(widget))];
  const hidden = Array.isArray(saved.hidden) ? saved.hidden.filter(isWidget) : [];
  return { order, hidden: hidden.filter((widget) => order.includes(widget)) };
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
