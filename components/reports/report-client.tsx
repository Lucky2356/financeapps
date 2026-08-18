"use client";

import { ReportView } from "@/components/reports/report-view";
import { TransfersToggle } from "@/components/analytics/transfers-toggle";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { transfersQuery, useIncludeTransfers } from "@/hooks/use-include-transfers";
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
  const [includeTransfers, setIncludeTransfers] = useIncludeTransfers();
  const { data: analyticsData } = useApiPageData(
    analytics,
    `/analytics${transfersQuery(includeTransfers)}`
  );
  // Capital is read off account balances, which a transfer never changes, so
  // the setting has nothing to say about it.
  const { data: dashboardData } = useApiPageData(dashboard, "/dashboard");

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end">
        <TransfersToggle checked={includeTransfers} onChange={setIncludeTransfers} />
      </div>
      <ReportView
        analytics={analyticsData}
        netWorth={dashboardData.netWorth}
        includeTransfers={includeTransfers}
      />
    </div>
  );
}
