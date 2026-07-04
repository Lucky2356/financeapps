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
      <PageHeader titleKey="page.forecast.title" descriptionKey="page.forecast.desc" />
      <ForecastClient initialData={data} />
      <ScenarioPanel />
    </div>
  );
}
