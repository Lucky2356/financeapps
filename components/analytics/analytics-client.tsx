"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { TransfersToggle } from "@/components/analytics/transfers-toggle";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { transfersQuery, useIncludeTransfers } from "@/hooks/use-include-transfers";
import type { AnalyticsData } from "@/lib/data";

// AnalyticsView renders several Recharts charts; load it (and Recharts) lazily so
// the heavy charting bundle is not part of the initial page load.
const AnalyticsView = dynamic(
  () => import("@/components/analytics/analytics-view").then((m) => m.AnalyticsView),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }
);

// Re-fetches analytics from the active API client so desktop shows real data.
// The transfers checkbox is part of the request, not a filter applied after the
// fact: every figure on the screen is recomputed from the rows that count.
export function AnalyticsClient({ initialData }: { initialData: AnalyticsData }) {
  const [includeTransfers, setIncludeTransfers] = useIncludeTransfers();
  const { data } = useApiPageData(initialData, `/analytics${transfersQuery(includeTransfers)}`);

  return (
    <>
      <div className="flex justify-end">
        <TransfersToggle checked={includeTransfers} onChange={setIncludeTransfers} />
      </div>
      <AnalyticsView data={data} />
    </>
  );
}
