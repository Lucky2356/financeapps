import { PageHeader } from "@/components/page-header";
import { ReportView } from "@/components/reports/report-view";
import { SourceBanner } from "@/components/source-banner";
import { getAnalyticsData, getDashboardData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function ReportsPage() {
  await ensureFreshServerData();
  const [analytics, dashboard] = await Promise.all([getAnalyticsData(), getDashboardData()]);

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.reports.title" descriptionKey="page.reports.desc" />
      <SourceBanner source={analytics.source} />
      <ReportView analytics={analytics} netWorth={dashboard.netWorth} />
    </div>
  );
}
