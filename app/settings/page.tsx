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
      <PageHeader titleKey="page.settings.title" descriptionKey="page.settings.desc" />
      <SourceBanner source={data.source} />
      <SettingsForm data={data} />
    </div>
  );
}
