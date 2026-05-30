import type { Metadata } from "next";

import { AnalyticsView } from "@/components/analytics/analytics-view";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getAnalyticsData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export const metadata: Metadata = {
  title: "Аналитика"
};

export default async function AnalyticsPage() {
  await ensureFreshServerData();
  const data = await getAnalyticsData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Аналитика"
        description="Денежные потоки, динамика сбережений и структура расходов за 6 месяцев."
      />
      <SourceBanner source={data.source} />
      <AnalyticsView data={data} />
    </div>
  );
}
