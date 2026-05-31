import type { Metadata } from "next";

import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { PageHeader } from "@/components/page-header";
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
      <AnalyticsClient initialData={data} />
    </div>
  );
}
