"use client";

import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { groupByDay } from "@/lib/transactions/day-groups";

/** «Сегодня · 2 340 ₽» над карточками одного дня. */
export function DayHeader({ group }: { group: ReturnType<typeof groupByDay>[number] }) {
  const { t } = useI18n();
  const label =
    group.when === "today"
      ? t("tx.day.today")
      : group.when === "yesterday"
        ? t("tx.day.yesterday")
        : formatDate(group.day);
  return (
    <div
      data-testid="day-header"
      className="flex items-baseline justify-between gap-2 px-1 pt-2 text-xs font-semibold text-muted-foreground first:pt-0"
    >
      <span>
        {label}
        {group.when !== "other" ? (
          <span className="ml-1.5 font-normal">{formatDate(group.day)}</span>
        ) : null}
      </span>
      <span className="num flex gap-2">
        {group.income > 0 ? (
          <span className="text-success">+{formatCurrency(group.income)}</span>
        ) : null}
        {group.expense > 0 ? <span>-{formatCurrency(group.expense)}</span> : null}
      </span>
    </div>
  );
}
