import { ImportExportPanel } from "@/components/import/import-export-panel";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getImportPageData, getTransactionsPageData } from "@/lib/data";

export default async function ImportPage() {
  const [data, transactions] = await Promise.all([getImportPageData(), getTransactionsPageData({})]);

  return (
    <div className="page-grid">
      <PageHeader title="Импорт и экспорт" description="Загрузка CSV с предпросмотром, маппингом колонок и экспорт операций в CSV/JSON." />
      <SourceBanner source={data.source} />
      <ImportExportPanel data={data} transactions={transactions.transactions} />
    </div>
  );
}
