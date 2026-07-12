// Tiny inline-SVG trend line for metric cards. Deliberately dependency-free (no
// recharts) so it costs nothing to render dozens of them — it's a decorative
// micro-trend, not an interactive chart. Colour follows the current text colour
// via `currentColor`, so callers set the tone with a text-* class.

export function Sparkline({
  values,
  width = 72,
  height = 22,
  strokeWidth = 1.5,
  className
}: {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}) {
  // Need at least two points to draw a line.
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  // Inset vertically by the stroke so the line never clips at the edges.
  const pad = strokeWidth;
  const usableH = height - pad * 2;

  const points = values.map((value, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((value - min) / span) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${points.join(" L")}`;
  // Soft area under the line for a touch of depth.
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const gradientId = `spark-${points.length}-${Math.round(min)}-${Math.round(max)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
