import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { SourceBanner } from "@/components/source-banner";
import { getSettingsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function SettingsPage() {
  await ensureFreshServerData();
  const data = await getSettingsPageData();

  return (
    <div className="page-grid">
      <PageHeader
        title="Настройки"
        description="Валюта, внешний вид, автоматизация, аккаунт и управление данными."
      />
      <SourceBanner source={data.source} />
      <SettingsForm data={data} />
    </div>
  );
}
