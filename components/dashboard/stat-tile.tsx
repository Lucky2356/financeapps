import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatTone = "default" | "success" | "warning" | "danger";

const chipTone: Record<StatTone, string> = {
  default: "bg-primary/12 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/18 text-warning",
  danger: "bg-destructive/12 text-destructive"
};

// One cell of the home screen's overview grid: caption, figure, sub-caption and
// a square icon chip on the right. Two per row on a phone, four on a desktop.
export function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone = "default",
  visual
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Rendered in place of the icon chip — used for the health gauge. */
  visual?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      {/* Caption and chip share the top line; the figure below gets the full
          width of the tile, because a truncated amount is worthless. */}
      <div className="flex items-start justify-between gap-2">
        {/* Two lines, always reserved: "Доходы за месяц" does not fit one line
            in a half-width tile, and a fixed height keeps the figures on the
            same baseline across the row. */}
        <p className="line-clamp-2 min-h-[2.6em] min-w-0 text-[13px] leading-[1.3] text-muted-foreground">
          {label}
        </p>
        {visual ??
          (Icon ? (
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                chipTone[tone]
              )}
            >
              <Icon className="size-[18px]" />
            </span>
          ) : null)}
      </div>
      <p className="stat num mt-2 truncate text-lg sm:text-xl">{value}</p>
      {caption ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
