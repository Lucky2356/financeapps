import { Suspense } from "react";

import { AiQuickAdd } from "@/components/ai/ai-quick-add";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { TransactionManager } from "@/components/transactions/transaction-manager";
import { getTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function TransactionsPage() {
  await ensureFreshServerData();
  const data = await getTransactionsPageData({});

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.transactions.title" descriptionKey="page.transactions.desc" />
      <SourceBanner source={data.source} />
      <AiQuickAdd />
      <Suspense
        fallback={
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            Загружаем операции...
          </div>
        }
      >
        <TransactionManager data={data} />
      </Suspense>
    </div>
  );
}
