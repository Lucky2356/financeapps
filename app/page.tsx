import { CashflowChart } from "@/components/charts/cashflow-chart";
import { ExpenseCategoryChart } from "@/components/charts/expense-category-chart";
import { FinanceHealthCard } from "@/components/finance-health-card";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { RecommendationList } from "@/components/recommendation-list";
import { SourceBanner } from "@/components/source-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/lib/data";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Главная"
        description="Финансовая картина месяца, динамика расходов, рекомендации и оценка устойчивости."
      />
      <SourceBanner source={data.source} />

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
