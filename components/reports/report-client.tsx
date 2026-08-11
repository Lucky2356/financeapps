"use client";

import { ReportView } from "@/components/reports/report-view";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { AnalyticsData } from "@/lib/data";
import type { DashboardData } from "@/types/finance";

// The report is built entirely on the server shell, and that shell is empty by
// design — the real figures live in the device's storage. Without this the page
// printed a full report of zeros next to screens that showed the actual money.
// Every other screen already reads through this hook; the report was the one
// that never did.
export function ReportClient({
  analytics,
  dashboard
}: {
  analytics: AnalyticsData;
  dashboard: DashboardData;
}) {
  const { data: analyticsData } = useApiPageData(analytics, "/analytics");
  const { data: dashboardData } = useApiPageData(dashboard, "/dashboard");

  return <ReportView analytics={analyticsData} netWorth={dashboardData.netWorth} />;
}
