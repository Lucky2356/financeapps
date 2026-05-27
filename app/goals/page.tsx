import { GoalManager } from "@/components/goals/goal-manager";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getGoalsPageData } from "@/lib/data";

export default async function GoalsPage() {
  const data = await getGoalsPageData();

  return (
    <div className="page-grid">
      <PageHeader title="Цели" description="Накопительные цели, прогресс и расчет нужного ежемесячного взноса." />
      <SourceBanner source={data.source} />
      <GoalManager data={data} />
    </div>
  );
}
