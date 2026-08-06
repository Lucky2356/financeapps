"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

// The headline panel of a screen: the single number that matters, the change
// beside it, and the trend behind it.
//
// Two skins, one composition. `accent` is the painted card — the design system
// allows exactly one of those, and it belongs to the home screen. Every other
// screen uses `plain`: same rhythm and same type scale on the ordinary card
// surface, so moving between screens is calm.
export function HeroCard({
  label,
  value,
  caption,
  changePercent,
  changeLabel,
  trend,
  progress,
  higherIsBetter = true,
  variant = "plain",
  className
}: {
  label: string;
  value: string;
  caption?: string;
  /** Change against the start of the trend window; omitted when unknown. */
  changePercent?: number | null;
  /** Text shown in the badge instead of a percentage (e.g. "69%"). */
  changeLabel?: string;
  /** Series drawn as the wave across the bottom of the card. */
  trend?: number[];
  /** 0…1 — drawn as a bar under the caption instead of a wave. */
  progress?: number | null;
  /**
   * Whether growth is good news. False on spending screens, where a month that
   * is 5% up is a warning, not a success — the arrow still follows the
   * direction, only the colour follows the meaning.
   */
  higherIsBetter?: boolean;
  variant?: "accent" | "plain";
  className?: string;
}) {
  const accent = variant === "accent";
  const hasChange = typeof changePercent === "number" && Number.isFinite(changePercent);
  const positive = hasChange && changePercent >= 0;
  const goodChange = higherIsBetter ? positive : !positive;
  const ChangeIcon = positive ? TrendingUp : TrendingDown;
  const badge = changeLabel ?? null;

  return (
    <section
      className={cn(
        "reveal relative overflow-hidden rounded-lg p-5 shadow-soft sm:p-6",
        accent ? "fa-hero text-white" : "border bg-card",
        className
      )}
    >
      {trend && trend.length > 1 ? <Wave values={trend} accent={accent} /> : null}

      <div className="relative flex items-start justify-between gap-3">
        <p className={cn("text-sm", accent ? "text-white/75" : "text-muted-foreground")}>{label}</p>
        {badge ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
              accent ? "bg-white/20" : "bg-secondary text-secondary-foreground"
            )}
          >
            {badge}
          </span>
        ) : hasChange ? (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
              accent
                ? "bg-white/20"
                : goodChange
                  ? "bg-success/15 text-success"
                  : "bg-destructive/12 text-destructive"
            )}
          >
            <ChangeIcon className="size-3.5" aria-hidden />
            {positive ? "+" : "−"}
            {Math.abs(changePercent).toFixed(1)}%
          </span>
        ) : null}
      </div>

      <p className="stat num relative mt-3 text-3xl sm:text-4xl">{value}</p>
      {caption ? (
        <p
          className={cn(
            "relative mt-1.5 text-sm",
            accent ? "text-white/75" : "text-muted-foreground"
          )}
        >
          {caption}
        </p>
      ) : null}

      {typeof progress === "number" ? (
        <div
          className={cn(
            "relative mt-4 h-1.5 overflow-hidden rounded-full",
            accent ? "bg-white/25" : "bg-secondary"
          )}
        >
          <span
            className={cn("block h-full rounded-full", accent ? "bg-white" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}

/** The decorative trend line across the lower half of the card. */
function Wave({ values, accent }: { values: number[]; accent: boolean }) {
  const width = 100;
  const height = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  // A smooth curve rather than a polyline: consecutive points are joined with a
  // cubic whose handles sit halfway between them, which is what gives the line
  // its wave shape instead of visible corners.
  const points = values.map((value, i) => ({
    x: i * step,
    y: height - ((value - min) / span) * (height - 4) - 2
  }));
  let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const midX = (previous.x + current.x) / 2;
    path += ` C${midX.toFixed(2)},${previous.y.toFixed(2)} ${midX.toFixed(2)},${current.y.toFixed(2)} ${current.x.toFixed(2)},${current.y.toFixed(2)}`;
  }

  return (
    <svg
      className={cn(
        // Lower and fainter on the plain card: without the painted background to
        // sit against, a tall wave reads as a smudge behind the figure.
        "pointer-events-none absolute inset-x-0 bottom-0 w-full",
        accent ? "h-24 text-white" : "h-14 text-primary"
      )}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={`${path} L${width},${height} L0,${height} Z`}
        fill="currentColor"
        fillOpacity={accent ? 0.1 : 0.06}
      />
      <path
        d={path}
        stroke="currentColor"
        strokeOpacity={accent ? 0.65 : 0.4}
        strokeWidth={0.8}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
