import { PageHeader } from "@/components/page-header";
import { ReportClient } from "@/components/reports/report-client";
import { getAnalyticsData, getDashboardData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function ReportsPage() {
  await ensureFreshServerData();
  const [analytics, dashboard] = await Promise.all([getAnalyticsData(), getDashboardData()]);

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.reports.title" descriptionKey="page.reports.desc" />
      </div>
      <ReportClient analytics={analytics} dashboard={dashboard} />
    </div>
  );
}
