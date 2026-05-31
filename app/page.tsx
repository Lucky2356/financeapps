import { Download } from "lucide-react";
import Link from "next/link";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { Button } from "@/components/ui/button";
import { getDashboardData, getForecastData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function DashboardPage() {
  await ensureFreshServerData();
  const [data, forecast] = await Promise.all([getDashboardData(), getForecastData()]);

  return (
    <div className="page-grid">
      <PageHeader
        title="Главная"
        description="Финансовая картина месяца и динамика расходов."
        actions={
          <>
            <QuickAddButton />
            <Button asChild variant="outline">
              <Link href="/import">
                <Download className="size-4" />
                Импорт
              </Link>
            </Button>
            <PrintButton />
          </>
        }
      />
      <DashboardClient initialData={data} initialForecast={forecast} />
    </div>
  );
}
