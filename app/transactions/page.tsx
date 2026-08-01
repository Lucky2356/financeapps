import { Suspense } from "react";

import { AiQuickAdd } from "@/components/ai/ai-quick-add";
import { LoadingCard } from "@/components/loading-card";
import { PageHeader } from "@/components/page-header";
import { TransactionManager } from "@/components/transactions/transaction-manager";
import { TransactionsAnalytics } from "@/components/transactions/transactions-analytics";
import { getTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function TransactionsPage() {
  await ensureFreshServerData();
  const data = await getTransactionsPageData({});

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.transactions.title" descriptionKey="page.transactions.desc" />
      <AiQuickAdd />
      <TransactionsAnalytics />
      <Suspense fallback={<LoadingCard messageKey="loading.transactions" />}>
        <TransactionManager data={data} />
      </Suspense>
    </div>
  );
}
