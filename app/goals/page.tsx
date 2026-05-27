import { GoalManager } from "@/components/goals/goal-manager";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getGoalsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function GoalsPage() {
  await ensureFreshServerData();
  const data = await getGoalsPageData();

  return (
    <div className="page-grid">
      <PageHeader title="Цели" description="Накопительные цели, прогресс и расчет нужного ежемесячного взноса." />
      <SourceBanner source={data.source} />
      <GoalManager data={data} />
    </div>
  );
}
