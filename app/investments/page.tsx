import { InvestmentsView } from "@/components/investments/investments-view";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getInvestmentData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function InvestmentsPage() {
  await ensureFreshServerData();
  const data = await getInvestmentData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Инвестиции"
        description="Watchlist, демо-портфель, структура, риски и образовательные подсказки без индивидуальных инвестиционных рекомендаций."
      />
      <SourceBanner source={data.source} />
      <InvestmentsView data={data} />
    </div>
  );
}
