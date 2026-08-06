import { GoalManager } from "@/components/goals/goal-manager";
import { GoalsSummary } from "@/components/goals/goals-summary";
import { PageHeader } from "@/components/page-header";
import { getGoalsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function GoalsPage() {
  await ensureFreshServerData();
  const data = await getGoalsPageData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.goals.title" descriptionKey="page.goals.desc" />
      </div>
      <GoalsSummary data={data} />
      <GoalManager data={data} />
    </div>
  );
}
