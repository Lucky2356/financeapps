import { ForecastView } from "@/components/forecast/forecast-view";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getForecastData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function ForecastPage() {
  await ensureFreshServerData();
  const data = await getForecastData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Прогноз"
        description="Плановый денежный поток на 30 и 90 дней, ближайшие обязательства и предупреждения о кассовых разрывах."
      />
      <SourceBanner source={data.source} />
      <ForecastView data={data} />
    </div>
  );
}
