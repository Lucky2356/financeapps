import { AiBudgetPlanCard } from "@/components/ai/ai-budget-plan-card";
import { BudgetManager } from "@/components/budgets/budget-manager";
import { BudgetsSummary } from "@/components/budgets/budgets-summary";
import { PageHeader } from "@/components/page-header";
import { RecommendationList } from "@/components/recommendation-list";
import { getBudgetsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function BudgetsPage() {
  await ensureFreshServerData();
  const data = await getBudgetsPageData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.budgets.title" descriptionKey="page.budgets.desc" />
      </div>
      <BudgetsSummary data={data} />
      <AiBudgetPlanCard />
      <BudgetManager data={data} />
      {/* An empty card that says "nothing to show" is itself something to
          scroll past — when there is no advice, there is no card. */}
      {data.recommendations.length > 0 && (
        <RecommendationList titleKey="page.budgets.optimization" items={data.recommendations} />
      )}
    </div>
  );
}
