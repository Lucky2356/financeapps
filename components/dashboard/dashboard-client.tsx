"use client";

import { CashflowChart, ExpenseCategoryChart, NetWorthChart } from "@/components/charts/lazy";
import { DashboardForecastStrip } from "@/components/dashboard-forecast-strip";
import { DashboardOverview } from "@/components/dashboard-overview";
import { DistributeCashflow } from "@/components/dashboard/distribute-cashflow";
import { EmergencyFundCard } from "@/components/dashboard/emergency-fund-card";
import { NetWorthBreakdownCard } from "@/components/dashboard/net-worth-breakdown";
import { MetricCard } from "@/components/metric-card";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { SourceBanner } from "@/components/source-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiPageData } from "@/hooks/use-api-page-data";
import type { DashboardData, ForecastData } from "@/types/finance";

// Client wrapper: re-fetches dashboard + forecast from the active API client
// (LocalApiClient on desktop) so the page shows real data instead of the empty
// snapshot baked into the static export.
export function DashboardClient({
  initialData,
  initialForecast
}: {
  initialData: DashboardData;
  initialForecast: ForecastData;
}) {
  const { data } = useApiPageData(initialData, "/dashboard");
  const { data: forecast } = useApiPageData(initialForecast, "/forecast");

  const freeCash = data.metrics.find((metric) => metric.title === "Свободный остаток");
  const showDistribute = freeCash?.tone === "success";

  return (
    <>
      <SourceBanner source={data.source} />
      <SetupChecklist />
      <DashboardOverview data={data} />
      {showDistribute && freeCash ? <DistributeCashflow freeCashflowLabel={freeCash.value} /> : null}
      <DashboardForecastStrip forecast={forecast} />
      <EmergencyFundCard fund={data.emergencyFund} currency={data.currency} />

      {data.netWorthTrend.length >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Динамика чистого капитала</CardTitle>
          </CardHeader>
          <CardContent>
            <NetWorthChart data={data.netWorthTrend} />
            <NetWorthBreakdownCard breakdown={data.netWorthBreakdown} currency={data.currency} />
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.title} metric={metric} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Расходы по категориям</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseCategoryChart data={data.categoryExpenses} />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {data.categoryExpenses.slice(0, 6).map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="font-medium">{Math.round(item.value).toLocaleString("ru-RU")} ₽</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Доходы и расходы по месяцам</CardTitle>
          </CardHeader>
          <CardContent>
            <CashflowChart data={data.monthlyCashflow} />
          </CardContent>
        </Card>
      </section>
    </>
  );
}
