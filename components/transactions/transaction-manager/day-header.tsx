"use client";

import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { groupByDay } from "@/lib/transactions/day-groups";

/**
 * «Сегодня 13 окт. 2026 · −2 340 ₽» над карточками одного дня.
 *
 * Дата дня — главный ориентир при листании, а была она мелкой серой подписью
 * и терялась между карточками. Теперь — цветом текста, полужирная и крупнее
 * подписей в карточках. И прилипает под шапкой приложения, пока листаешь этот
 * день (`sticky-under-topbar`): заголовок стоит первым в обёртке своего дня,
 * так что следующий день вытесняет его, а не ложится сверху.
 */
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
      className="sticky-under-topbar z-10 -mx-1 flex items-baseline justify-between gap-2 bg-card px-1 py-1.5 text-[15px] font-semibold text-foreground"
    >
      <span className="min-w-0 truncate">
        {label}
        {group.when !== "other" ? (
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
            {formatDate(group.day)}
          </span>
        ) : null}
      </span>
      <span className="num flex shrink-0 gap-2">
        {group.income > 0 ? (
          <span className="text-success">+{formatCurrency(group.income)}</span>
        ) : null}
        {group.expense > 0 ? <span>-{formatCurrency(group.expense)}</span> : null}
      </span>
    </div>
  );
}
