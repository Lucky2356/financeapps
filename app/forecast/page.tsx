import { ForecastClient } from "@/components/forecast/forecast-client";
import { ScenarioPanel } from "@/components/forecast/scenario-panel";
import { PageHeader } from "@/components/page-header";
import { getForecastData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function ForecastPage() {
  await ensureFreshServerData();
  const data = await getForecastData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.forecast.title" descriptionKey="page.forecast.desc" />
      </div>
      <ForecastClient initialData={data} />
      <ScenarioPanel />
    </div>
  );
}
