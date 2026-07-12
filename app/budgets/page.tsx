import { AiBudgetPlanCard } from "@/components/ai/ai-budget-plan-card";
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
      <PageHeader titleKey="page.budgets.title" descriptionKey="page.budgets.desc" />
      <SourceBanner source={data.source} />
      <AiBudgetPlanCard />
      <BudgetManager data={data} />
      <RecommendationList titleKey="page.budgets.optimization" items={data.recommendations} />
    </div>
  );
}
