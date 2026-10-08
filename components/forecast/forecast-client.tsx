"use client";

import { useEffect, useState } from "react";

import { CashflowCalendar } from "@/components/forecast/cashflow-calendar";
import { ForecastView } from "@/components/forecast/forecast-view";
import { apiClient } from "@/lib/api/client";
import { goalDeadlineMarkers, type CalendarMarker } from "@/lib/calendar/markers";
import { upcomingDividends } from "@/lib/investments/dividends";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { useDataVersion } from "@/hooks/use-data-version";
import type { ExpectedDividend, ForecastData } from "@/types/finance";

// Re-fetches forecast from the active API client so desktop shows real data.
export function ForecastClient({ initialData }: { initialData: ForecastData }) {
  const { data } = useApiPageData(initialData, "/forecast");
  const [markers, setMarkers] = useState<CalendarMarker[]>([]);
  // Цели и дивиденды правят на своих экранах и на других устройствах.
  const version = useDataVersion();

  // Goal deadlines overlay the cashflow calendar as milestone markers, turning
  // it into a unified financial calendar (bills + goal deadlines + budget reset).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [goals, dividends] = await Promise.all([
          apiClient.get("/goals"),
          apiClient
            .get("/investments/dividends")
            .catch(() => ({ dividends: [] as ExpectedDividend[] }))
        ]);
        if (cancelled) return;
        const dividendMarkers: CalendarMarker[] = upcomingDividends(dividends.dividends).map(
          (dividend) => ({
            id: `dividend-${dividend.id}`,
            date: dividend.date.slice(0, 10),
            kind: "dividend" as const,
            title: `${dividend.ticker} · ${dividend.amount}`
          })
        );
        setMarkers([...goalDeadlineMarkers(goals.goals), ...dividendMarkers]);
      } catch {
        /* offline / unavailable — calendar still shows cashflow + budget reset */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <>
      <ForecastView data={data} />
      <CashflowCalendar events={data.events} currency={data.currency} markers={markers} />
    </>
  );
}
