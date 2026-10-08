"use client";

import type { useRouter, useSearchParams } from "next/navigation";

import type { TransactionsPageData } from "@/lib/data";
import type { useI18n } from "@/lib/i18n/context";
import { countableAmount } from "@/lib/transactions/base-amount";
import { groupByDay } from "@/lib/transactions/day-groups";
import { criteriaFromParams, matchesCriteria } from "@/lib/transactions/filter";
import { withFilter } from "@/lib/transactions/filter-chips";
import { isDateSort, parseSort, type TxSort } from "@/lib/transactions/sort";

/**
 * Что показывать в списке: строки под фильтром, порядок, заголовки дней и
 * итоги. Считается заново на каждом рендере — состояния здесь нет.
 */
export function useTransactionListView({
  pageData,
  searchParams,
  paramsString,
  router,
  t
}: {
  pageData: TransactionsPageData;
  searchParams: ReturnType<typeof useSearchParams>;
  paramsString: string;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const criteria = criteriaFromParams(searchParams);
  const visibleTransactions = pageData.transactions.filter((transaction) =>
    matchesCriteria(transaction, criteria)
  );

  // Порядок списка живёт в адресе (`sort`), как и фильтры: его можно отправить
  // ссылкой, и он переживает обновление страницы.
  const sort = parseSort(searchParams.get("sort"));
  const sortLabel: Record<TxSort, string> = {
    "date-desc": t("tx.sort.dateDesc"),
    "date-asc": t("tx.sort.dateAsc"),
    "amount-desc": t("tx.sort.amountDesc"),
    "amount-asc": t("tx.sort.amountAsc")
  };
  function changeSort(next: TxSort) {
    const params = withFilter(
      new URLSearchParams(paramsString),
      "sort",
      next === "date-desc" ? "" : next
    );
    const query = params.toString();
    router.push(query ? `/transactions?${query}` : "/transactions");
  }

  // Заголовки дней — только при порядке по дате: при «крупные сверху» дни
  // перемешаны, и заголовки над каждой карточкой были бы шумом.
  const dayGroups = isDateSort(sort)
    ? groupByDay(visibleTransactions, new Date(), countableAmount)
    : null;
  const dayStarts = new Map((dayGroups ?? []).map((group) => [group.items[0].id, group]));

  const totals = visibleTransactions.reduce(
    (acc, transaction) => {
      // A dollar operation contributes what it is worth in the base currency,
      // not its number of dollars.
      if (transaction.type === "INCOME") acc.income += countableAmount(transaction);
      if (transaction.type === "EXPENSE") acc.expense += countableAmount(transaction);
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const net = totals.income - totals.expense;

  return { visibleTransactions, sort, sortLabel, changeSort, dayStarts, totals, net };
}
