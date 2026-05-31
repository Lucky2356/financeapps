import { ForecastClient } from "@/components/forecast/forecast-client";
import { PageHeader } from "@/components/page-header";
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
      <ForecastClient initialData={data} />
    </div>
  );
}
