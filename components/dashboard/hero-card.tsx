"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

// The home screen's headline panel: one accent-filled card carrying the single
// number that matters, the change against the previous point, and the trend
// behind it. Everything else on the page is outlined, so this is what the eye
// lands on first.
export function HeroCard({
  label,
  value,
  caption,
  changePercent,
  trend
}: {
  label: string;
  value: string;
  caption: string;
  /** Change against the first point of the trend; omitted when unknown. */
  changePercent?: number | null;
  /** Series drawn as the wave across the bottom of the card. */
  trend?: number[];
}) {
  const hasChange = typeof changePercent === "number" && Number.isFinite(changePercent);
  const positive = hasChange && changePercent >= 0;
  const ChangeIcon = positive ? TrendingUp : TrendingDown;

  return (
    <section className="fa-hero reveal relative overflow-hidden rounded-lg p-5 text-white shadow-soft sm:p-6">
      <Wave values={trend ?? []} />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm text-white/75">{label}</p>
        {hasChange ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
            <ChangeIcon className="size-3.5" aria-hidden />
            {positive ? "+" : "−"}
            {Math.abs(changePercent).toFixed(1)}%
          </span>
        ) : null}
      </div>

      <p className="stat relative mt-3 text-3xl sm:text-4xl">{value}</p>
      <p className="relative mt-1.5 text-sm text-white/75">{caption}</p>
    </section>
  );
}

/** The decorative trend line across the lower half of the card. */
function Wave({ values }: { values: number[] }) {
  if (values.length < 2) return null;

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
      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path d={`${path} L${width},${height} L0,${height} Z`} fill="rgba(255,255,255,0.10)" />
      <path
        d={path}
        stroke="rgba(255,255,255,0.65)"
        strokeWidth={0.8}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
