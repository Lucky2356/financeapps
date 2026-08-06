import { DebtManager } from "@/components/debts/debt-manager";
import { DebtsSummary } from "@/components/debts/debts-summary";
import { PageHeader } from "@/components/page-header";
import { getLiabilitiesPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function DebtsPage() {
  await ensureFreshServerData();
  const data = await getLiabilitiesPageData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.debts.title" descriptionKey="page.debts.desc" />
      </div>
      <DebtsSummary data={data} />
      <DebtManager data={data} />
    </div>
  );
}
