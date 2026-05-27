import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { TransactionManager } from "@/components/transactions/transaction-manager";
import { getTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await ensureFreshServerData();
  const data = await getTransactionsPageData(searchParams);

  return (
    <div className="page-grid">
      <PageHeader
        title="Операции"
        description="Ручной ввод, редактирование, удаление и фильтрация доходов и расходов."
      />
      <SourceBanner source={data.source} />
      <TransactionManager data={data} />
    </div>
  );
}
