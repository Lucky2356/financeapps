"use client";

import type { ReactNode, ThHTMLAttributes } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PlanFactColumn } from "@/types/finance";

export function Head({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      {...props}
      className={cn(
        "whitespace-nowrap border-b bg-card px-3 py-2 align-bottom text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </th>
  );
}

/**
 * The two sub-columns under a total: what went through cash and cards, and what
 * went through savings.
 *
 * "Итого" alone answered how much, never where it ended up — and the two pools
 * are the whole point of a month for someone who is trying to put money aside.
 */
export function TotalHead() {
  const { t } = useI18n();
  return (
    <>
      {(["plan.opening.main", "plan.opening.savings"] as const).map((key, index) => (
        <Head key={key} className={cn("text-right font-semibold", index === 0 && "border-l")}>
          <span className="flex flex-col items-end leading-tight">
            <span>{t("plan.total")}</span>
            <span className="text-[10px] font-normal text-muted-foreground/80">{t(key)}</span>
          </span>
        </Head>
      ))}
    </>
  );
}

// A category column keeps its own colour and icon in the header — the same
// marks it carries everywhere else, so a column is recognised without reading.
export function ColumnHead({ column, className }: { column: PlanFactColumn; className?: string }) {
  return (
    <Head
      className={cn("text-left", className)}
      style={{ boxShadow: `inset 0 -2px 0 ${column.color}` }}
    >
      <span className="flex items-center gap-1.5">
        <span
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: column.color }}
        >
          <CategoryIcon name={column.icon} className="size-2.5" />
        </span>
        {column.label}
      </span>
    </Head>
  );
}
