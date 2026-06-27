"use client";

import { InfoHint } from "@/components/info-hint";
import { CHART_PALETTE } from "@/lib/charts/palette";
import { useI18n } from "@/lib/i18n/context";
import type { ChartDatum } from "@/types/finance";

// "Where your money is" at a glance: a compact horizontal stacked bar of the
// portfolio's position weights with a small legend. Reads the same `structure`
// data the donut uses ({ name: ticker, value: share% }) so the two stay in sync.
// The largest positions are shown individually; the rest collapse into "Other".
export function AllocationBar({ data }: { data: ChartDatum[] }) {
  const { t } = useI18n();
  const TOP = 6;

  const items = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;

  const top = items.slice(0, TOP);
  const restValue = items.slice(TOP).reduce((sum, d) => sum + d.value, 0);
  const segments = top.map((d, index) => ({
    name: d.name,
    value: d.value,
    color: CHART_PALETTE[index % CHART_PALETTE.length]
  }));
  if (restValue > 0) {
    segments.push({
      name: t("inv.hero.allocationOther"),
      value: restValue,
      color: CHART_PALETTE[CHART_PALETTE.length - 1]
    });
  }
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        {t("inv.hero.allocationTitle")}
        <InfoHint text="hint.allocation" />
      </p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={t("inv.hero.allocationTitle")}
      >
        {segments.map((s) => (
          <div
            key={s.name}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.name}: ${s.value.toFixed(1)}%`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="font-medium">{s.value.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
