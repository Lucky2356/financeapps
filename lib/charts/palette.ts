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
export const CHART_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--warning))",
  "hsl(var(--info))",
  "#db2777",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "hsl(var(--muted-foreground))"
];
