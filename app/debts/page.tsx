import { DebtManager } from "@/components/debts/debt-manager";
import { PageHeader } from "@/components/page-header";
import { getLiabilitiesPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function DebtsPage() {
  await ensureFreshServerData();
  const data = await getLiabilitiesPageData();

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.debts.title" descriptionKey="page.debts.desc" />
      <DebtManager data={data} />
    </div>
  );
}
