import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ImportLinkButton } from "@/components/dashboard/import-link-button";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { getDashboardData, getForecastData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function DashboardPage() {
  await ensureFreshServerData();
  const [data, forecast] = await Promise.all([getDashboardData(), getForecastData()]);

  return (
    <div className="page-grid">
      <PageHeader
        titleKey="page.home.title"
        descriptionKey="page.home.desc"
        actions={
          <>
            <QuickAddButton />
            <ImportLinkButton />
            <PrintButton />
          </>
        }
      />
      <DashboardClient initialData={data} initialForecast={forecast} />
    </div>
  );
}
