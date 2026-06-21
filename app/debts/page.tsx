import { DebtManager } from "@/components/debts/debt-manager";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getLiabilitiesPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function DebtsPage() {
  await ensureFreshServerData();
  const data = await getLiabilitiesPageData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Долги"
        description="Кредиты, рассрочки и другие обязательства. Уменьшают чистый капитал; помогаем спланировать погашение."
      />
      <SourceBanner source={data.source} />
      <DebtManager data={data} />
    </div>
  );
}
