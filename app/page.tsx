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
      {/* On a phone the greeting header in the app bar already names the screen
          and the round button in the bottom bar covers "add" — a second title
          row with the same actions would only push the headline card down. */}
      <div className="hidden md:block">
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
      </div>
      <DashboardClient initialData={data} initialForecast={forecast} />
    </div>
  );
}
