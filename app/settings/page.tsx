import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettingsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function SettingsPage() {
  await ensureFreshServerData();
  const data = await getSettingsPageData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.settings.title" descriptionKey="page.settings.desc" />
      </div>
      <SettingsForm data={data} />
    </div>
  );
}
