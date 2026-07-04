import type { Metadata } from "next";

import { AiInsightPanel } from "@/components/analytics/ai-insight-panel";
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
      <PageHeader titleKey="page.analytics.title" descriptionKey="page.analytics.desc" />
      <AiInsightPanel />
      <AnalyticsClient initialData={data} />
    </div>
  );
}
