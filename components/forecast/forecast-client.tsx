"use client";

import { useEffect, useState } from "react";

import { CashflowCalendar } from "@/components/forecast/cashflow-calendar";
import { ForecastView } from "@/components/forecast/forecast-view";
import { SourceBanner } from "@/components/source-banner";
import { apiClient } from "@/lib/api/client";
import { goalDeadlineMarkers, type CalendarMarker } from "@/lib/calendar/markers";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { ForecastData, GoalRow } from "@/types/finance";

// Re-fetches forecast from the active API client so desktop shows real data.
export function ForecastClient({ initialData }: { initialData: ForecastData }) {
  const { data } = useApiPageData(initialData, "/forecast");
  const [markers, setMarkers] = useState<CalendarMarker[]>([]);

  // Goal deadlines overlay the cashflow calendar as milestone markers, turning
  // it into a unified financial calendar (bills + goal deadlines + budget reset).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const goals = await apiClient.get<{ goals: GoalRow[] }>("/goals");
        if (!cancelled) setMarkers(goalDeadlineMarkers(goals.goals));
      } catch {
        /* offline / unavailable — calendar still shows cashflow + budget reset */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SourceBanner source={data.source} />
      <ForecastView data={data} />
      <CashflowCalendar events={data.events} currency={data.currency} markers={markers} />
    </>
  );
}
