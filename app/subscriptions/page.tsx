import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getRecurringTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function SubscriptionsPage() {
  await ensureFreshServerData();
  const data = await getRecurringTransactionsPageData();

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.subscriptions.title" descriptionKey="page.subscriptions.desc" />
      <SourceBanner source={data.source} />
      <SubscriptionsView data={data} />
    </div>
  );
}
