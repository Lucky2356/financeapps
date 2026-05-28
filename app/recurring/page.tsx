import { PageHeader } from "@/components/page-header";
import { RecurringManager } from "@/components/recurring/recurring-manager";
import { SourceBanner } from "@/components/source-banner";
import { getRecurringTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function RecurringPage() {
  await ensureFreshServerData();
  const data = await getRecurringTransactionsPageData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Плановые платежи"
        description="Повторяющиеся доходы и расходы, ближайшие обязательства и создание операций по расписанию."
      />
      <SourceBanner source={data.source} />
      <RecurringManager data={data} />
    </div>
  );
}
