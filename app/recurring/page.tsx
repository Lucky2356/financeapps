import { PageHeader } from "@/components/page-header";
import { RecurringManager } from "@/components/recurring/recurring-manager";
import { getRecurringTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function RecurringPage() {
  await ensureFreshServerData();
  const data = await getRecurringTransactionsPageData();

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.recurring.title" descriptionKey="page.recurring.desc" />
      <RecurringManager data={data} />
    </div>
  );
}
