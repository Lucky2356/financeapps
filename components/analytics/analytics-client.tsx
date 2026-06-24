"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { SourceBanner } from "@/components/source-banner";
import { useApiPageData } from "@/hooks/use-api-page-data";
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
export function AnalyticsClient({ initialData }: { initialData: AnalyticsData }) {
  const { data } = useApiPageData(initialData, "/analytics");

  return (
    <>
      <SourceBanner source={data.source} />
      <AnalyticsView data={data} />
    </>
  );
}
