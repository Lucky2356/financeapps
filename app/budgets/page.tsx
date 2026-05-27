import { BudgetManager } from "@/components/budgets/budget-manager";
import { PageHeader } from "@/components/page-header";
import { RecommendationList } from "@/components/recommendation-list";
import { SourceBanner } from "@/components/source-banner";
import { getBudgetsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function BudgetsPage() {
  await ensureFreshServerData();
  const data = await getBudgetsPageData();

  return (
    <div className="page-grid">
      <PageHeader title="Бюджеты" description="Лимиты по категориям, прогресс и предупреждения при превышении." />
      <SourceBanner source={data.source} />
      <BudgetManager data={data} />
      <RecommendationList title="Оптимизация расходов" items={data.recommendations} />
    </div>
  );
}
