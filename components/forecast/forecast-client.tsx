"use client";

import { CashflowCalendar } from "@/components/forecast/cashflow-calendar";
import { ForecastView } from "@/components/forecast/forecast-view";
import { SourceBanner } from "@/components/source-banner";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { ForecastData } from "@/types/finance";

// Re-fetches forecast from the active API client so desktop shows real data.
export function ForecastClient({ initialData }: { initialData: ForecastData }) {
  const { data } = useApiPageData(initialData, "/forecast");

  return (
    <>
      <SourceBanner source={data.source} />
      <ForecastView data={data} />
      <CashflowCalendar events={data.events} currency={data.currency} />
    </>
  );
}
