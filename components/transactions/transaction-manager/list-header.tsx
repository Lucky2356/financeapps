"use client";

import { useRouter } from "next/navigation";

import { CardHeader } from "@/components/ui/card";
import { NOTICE_ACTION_CLASS, NoticeLine } from "@/components/ui/notice-line";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { TX_SORTS, type TxSort } from "@/lib/transactions/sort";

/**
 * Шапка карточки списка: итоги под фильтром, порядок, будущие даты. Сами
 * фильтры — наверху экрана (transactions-filters-card.tsx).
 */
export function TransactionListHeader({
  pageData,
  visibleCount,
  totals,
  net,
  sort,
  sortLabel,
  onSortChange
}: {
  pageData: TransactionsPageData;
  visibleCount: number;
  totals: { income: number; expense: number };
  net: number;
  sort: TxSort;
  sortLabel: Record<TxSort, string>;
  onSortChange: (next: TxSort) => void;
}) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <CardHeader className="gap-3">
      {/* The totals belong to the rows below them: they follow the filter,
          unlike the month tiles at the top of the screen.
          Порядок — во всю ширину на телефоне: справа от итогов ему оставалась
          полоска, и итоги ломались в четыре строки; с sm он встаёт справа. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="num flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">{t("tx.shown", { count: visibleCount })}</span>
          <span className="text-success">+{formatCurrency(totals.income)}</span>
          <span className="text-destructive">-{formatCurrency(totals.expense)}</span>
          <span
            className={net >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}
          >
            {t("tx.sumNet")}: {formatCurrency(net)}
          </span>
        </p>
        <Select value={sort} onValueChange={(value) => onSortChange(value as TxSort)}>
          <SelectTrigger
            className="h-9 w-full sm:w-48"
            aria-label={t("tx.sort.label")}
            data-testid="tx-sort"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TX_SORTS.map((value) => (
              <SelectItem key={value} value={value}>
                {sortLabel[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Money that has already left the balance for a day that has not
          arrived. Counted over the whole ledger rather than the rows below:
          the screen opens on the current month, so an operation dated a
          year out is not on the page at all — while the home screen has
          already subtracted it. Deliberate post-dating is a real thing, so
          this states the fact and offers the rows; it does not scold. */}
      {pageData.futureDated.count > 0 ? (
        <NoticeLine testId="future-dated-notice">
          <span>
            {t("tx.future.notice", {
              count: pageData.futureDated.count,
              sum: formatCurrency(Math.abs(pageData.futureDated.net))
            })}
          </span>
          <button
            type="button"
            className={NOTICE_ACTION_CLASS}
            onClick={() => {
              const from = new Date();
              from.setDate(from.getDate() + 1);
              const iso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
              router.push(`/transactions?from=${iso}&to=2999-12-31`);
            }}
          >
            {t("tx.future.show")}
          </button>
        </NoticeLine>
      ) : null}
    </CardHeader>
  );
}
