// Radial gauge for the Finance Health score (0–100). Pure SVG — a background
// track plus a foreground arc whose length and colour track the score, with the
// number in the centre. Replaces the flat linear progress bar on the dashboard.
//
// Geometry: a 270° sweep with the 90° gap centred at the bottom. The SVG is
// rotated 135° so the arc starts at the 7:30 position and runs clockwise; the
// arc length is encoded directly in stroke-dasharray (no dashoffset maths, which
// is fragile on a partial arc).

const TONE = {
  good: "text-success",
  warning: "text-warning",
  critical: "text-destructive"
} as const;

export type HealthTone = keyof typeof TONE;

export function HealthGauge({
  score,
  tone,
  size = 132,
  strokeWidth = 11
}: {
  score: number;
  tone: HealthTone;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = 0.75; // 270° of the full circle
  const trackLen = circumference * sweep;
  const valueLen = trackLen * (clamped / 100);
  const center = size / 2;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}/100`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(135deg)" }}
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-muted"
          stroke="currentColor"
          strokeDasharray={`${trackLen} ${circumference}`}
        />
        {/* Value arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={TONE[tone]}
          stroke="currentColor"
          strokeDasharray={`${valueLen} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="stat text-3xl leading-none">{clamped}</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
