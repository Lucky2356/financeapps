// Shared recharts <Tooltip> styling. Recharts' default tooltip renders a hard
// white box that breaks in dark mode; these theme-token styles make it follow
// the app theme (popover surface + border + soft shadow). Spread onto <Tooltip>
// alongside any chart-specific `formatter`/`labelFormatter`, which keep working
// because we style the default tooltip rather than replacing its content.
export const chartTooltipProps = {
  allowEscapeViewBox: { x: true, y: true },
  wrapperStyle: {
    outline: "none",
    pointerEvents: "none" as const,
    zIndex: 80
  },
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.6rem",
    boxShadow: "0 10px 30px -12px rgb(15 23 42 / 0.45)",
    color: "hsl(var(--popover-foreground))",
    padding: "0.5rem 0.75rem"
  },
  labelStyle: {
    color: "hsl(var(--muted-foreground))",
    marginBottom: "0.25rem",
    fontSize: "0.75rem",
    fontWeight: 500
  },
  itemStyle: {
    color: "hsl(var(--popover-foreground))",
    fontVariantNumeric: "tabular-nums" as const,
    padding: 0
  },
  cursor: { fill: "hsl(var(--muted))", fillOpacity: 0.4 }
};
