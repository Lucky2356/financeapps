import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PlanFactView } from "@/components/plan/plan-fact-view";
import { TransferPairsCard } from "@/components/transactions/transfer-pairs-card";
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
      {/* Несвязанные половины перевода между своими счетами план/факт честно
          считает доходом и тратой — связать их можно прямо здесь. */}
      <TransferPairsCard planHint />
      <PlanFactView initialData={data} />
    </div>
  );
}
