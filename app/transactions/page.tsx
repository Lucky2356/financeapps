import { Suspense } from "react";

import { AiQuickAdd } from "@/components/ai/ai-quick-add";
import { LoadingCard } from "@/components/loading-card";
import { PageHeader } from "@/components/page-header";
import { LedgerViews } from "@/components/transactions/ledger-views";
import { TransactionManager } from "@/components/transactions/transaction-manager";
import { TransactionsDataProvider } from "@/components/transactions/transaction-manager/data-context";
import { TransactionsFiltersCard } from "@/components/transactions/transactions-filters-card";
import { TransactionsSummary } from "@/components/transactions/transactions-summary";
import { TransactionsAnalytics } from "@/components/transactions/transactions-analytics";
import { TransferPairsCard } from "@/components/transactions/transfer-pairs-card";
import { getTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function TransactionsPage() {
  await ensureFreshServerData();
  const data = await getTransactionsPageData({});

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.transactions.title" descriptionKey="page.transactions.desc" />
      </div>
      {/* Фильтры — первыми: до них не надо листать мимо плиток и аналитики.
          Данные у них со списком общие (TransactionsDataProvider), поэтому
          граница Suspense — вокруг всего, что читает адрес. Провайдер своей
          разметки не добавляет: карточки остаются ячейками page-grid. */}
      <Suspense fallback={<LoadingCard messageKey="loading.transactions" />}>
        <TransactionsDataProvider data={data}>
          <TransactionsFiltersCard />
          <TransactionsSummary />
          <TransferPairsCard />
          <AiQuickAdd />
          <TransactionsAnalytics />
          <LedgerViews>
            <TransactionManager data={data} />
          </LedgerViews>
        </TransactionsDataProvider>
      </Suspense>
    </div>
  );
}
