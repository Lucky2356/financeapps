import { InvestmentsView } from "@/components/investments/investments-view";
import { PageHeader } from "@/components/page-header";
import { getInvestmentData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function InvestmentsPage() {
  await ensureFreshServerData();
  const data = await getInvestmentData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.investments.title" descriptionKey="page.investments.desc" />
      </div>
      <InvestmentsView data={data} />
    </div>
  );
}
