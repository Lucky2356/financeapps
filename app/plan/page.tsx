import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PlanFactView } from "@/components/plan/plan-fact-view";
import { getPlanFactPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export const metadata: Metadata = {
  title: "План/факт"
};

export default async function PlanPage() {
  await ensureFreshServerData();
  const data = await getPlanFactPageData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.plan.title" descriptionKey="page.plan.desc" />
      </div>
      <PlanFactView initialData={data} />
    </div>
  );
}
