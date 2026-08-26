"use client";

import { CategoryIcon } from "@/components/category-icon";

// A category the way it looks everywhere it is named: its picture on its own
// colour, then the name. Lists of a dozen categories are read by shape long
// before they are read by word, and a dropdown of plain text made the owner
// hunt for the row she already knew the look of.
export function CategoryOptionLabel({
  label,
  color,
  icon
}: {
  label: string;
  color?: string | null;
  icon?: string | null;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: color ? `${color}22` : "hsl(var(--muted))",
          color: color ?? "hsl(var(--muted-foreground))"
        }}
      >
        <CategoryIcon name={icon} className="size-3" />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
