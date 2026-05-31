"use client";

import { AnalyticsView } from "@/components/analytics/analytics-view";
import { SourceBanner } from "@/components/source-banner";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { AnalyticsData } from "@/lib/data";

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
