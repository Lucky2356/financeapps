import { Download, Plus } from "lucide-react";
import Link from "next/link";

import { CashflowChart } from "@/components/charts/cashflow-chart";
import { DashboardActionPlan } from "@/components/dashboard-action-plan";
import { DashboardForecastStrip } from "@/components/dashboard-forecast-strip";
import { DashboardOverview } from "@/components/dashboard-overview";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { FinanceHealthCard } from "@/components/finance-health-card";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { RecommendationList } from "@/components/recommendation-list";
import { SourceBanner } from "@/components/source-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData, getForecastData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function DashboardPage() {
  await ensureFreshServerData();
  const [data, forecast] = await Promise.all([getDashboardData(), getForecastData()]);

  return (
    <div className="page-grid">
      <PageHeader
        title="Главная"
        description="Финансовая картина месяца, динамика расходов, рекомендации и оценка устойчивости."
        actions={
          <>
            <Button asChild>
              <Link href="/transactions">
                <Plus className="size-4" />
                Операция
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/import">
                <Download className="size-4" />
                Импорт
              </Link>
            </Button>
          </>
        }
      />
      <SourceBanner source={data.source} />
      <DashboardOverview data={data} />
      <DashboardForecastStrip forecast={forecast} />
      <DashboardActionPlan data={data} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RecommendationList title="Рекомендации" items={data.recommendations} />
        <FinanceHealthCard health={data.health} />
      </section>
    </div>
  );
}
