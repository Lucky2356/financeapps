import { ImportExportPanel } from "@/components/import/import-export-panel";
import { PageHeader } from "@/components/page-header";
import { getImportPageData, getTransactionsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function ImportPage() {
  await ensureFreshServerData();
  const [data, transactions] = await Promise.all([
    getImportPageData(),
    getTransactionsPageData({})
  ]);

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.import.title" descriptionKey="page.import.desc" />
      </div>
      <ImportExportPanel data={data} transactions={transactions.transactions} />
    </div>
  );
}
