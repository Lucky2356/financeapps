"use client";

import { TransactionFilterBar } from "@/components/transactions/filter-bar";
import { useTransactionsPage } from "@/components/transactions/transaction-manager/data-context";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";

/**
 * Фильтры «Учёта» — первой карточкой экрана.
 *
 * Они стояли в шапке списка, под аналитикой и переключателем «Список /
 * Календарь»: чтобы выбрать счёт, на телефоне приходилось листать мимо плиток
 * и графиков. Теперь они наверху и служат обоим видам — и списку, и календарю
 * (тот берёт из них всё, кроме периода: месяц он листает сам).
 */
export function TransactionsFiltersCard() {
  const { t } = useI18n();
  const { pageData } = useTransactionsPage();

  return (
    <Card data-testid="tx-filters">
      <CardHeader>
        <TransactionFilterBar
          title={<CardTitle>{t("tx.title")}</CardTitle>}
          categories={pageData.categories}
          accounts={pageData.accounts}
          defaultLimit={pageData.pagination.limit}
        />
      </CardHeader>
    </Card>
  );
}
