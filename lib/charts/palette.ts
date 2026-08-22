// Theme-aware chart colours. Recharts writes `fill`/`stroke` as SVG presentation
// attributes, and browsers DO resolve `hsl(var(--token))` there (a bare
// `var(--token)` does not, because our tokens store raw "H S% L%" triples). So
// every colour below is wrapped in hsl(var(...)) and therefore follows both the
// light/dark theme and the selected accent automatically — no JS, no re-render.

/** Semantic series colours used by the line/area/bar charts. */
export const chartTokens = {
  primary: "hsl(var(--primary))",
  income: "hsl(var(--success))",
  expense: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
  info: "hsl(var(--info))",
  /** Gridlines and axis text — quiet, theme-following. */
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted-foreground))"
} as const;

/** Shared props so gridlines look identical (and theme-correct) across charts. */
export const chartGridProps = {
  strokeDasharray: "3 3",
  vertical: false,
  stroke: chartTokens.grid
} as const;

/** Shared axis tick styling (muted, small) — spread onto XAxis/YAxis `tick`. */
export const chartAxisTick = { fill: chartTokens.axis, fontSize: 12 } as const;

// Categorical palette for donuts / allocation strips. Kept as an ordered set of
// distinct hues (distinctness matters more than theming here); the primary slot
// follows the accent, the rest are fixed hues that read on both themes.
//
// The order matters as much as the colours: neighbouring slices sit next to
// each other in the ring and in the legend, so two blue-violets in the list —
// which is what the accent and #7c3aed were — made a three-slice chart look
// like it had two of the same thing.
export const CHART_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--warning))",
  "#6fb2d2",
  "#e2788a",
  "#7ed6b7",
  "#c9a2d8",
  "#0891b2",
  "hsl(var(--muted-foreground))"
];

/**
 * A fixed colour per kind of asset. Shares, bonds, funds and metal are four
 * fixed things, not an arbitrary list, so they get four fixed colours instead
 * of whatever position they happen to take in the ring — the "by kind" chart
 * used to paint funds and bonds the same violet twice.
 */
export const ASSET_KIND_COLORS: Record<string, string> = {
  STOCK: "hsl(var(--primary))",
  BOND: "#6fb2d2",
  FUND: "#7ed6b7",
  GOLD: "#e2b26e",
  OTHER: "hsl(var(--muted-foreground))"
};
