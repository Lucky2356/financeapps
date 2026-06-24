import { PageHeader } from "@/components/page-header";
import { AccountSection } from "@/components/settings/account-section";
import { LocalModePanel } from "@/components/settings/local-mode-panel";
import { SettingsForm } from "@/components/settings/settings-form";
import { SourceBanner } from "@/components/source-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSettingsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function SettingsPage() {
  await ensureFreshServerData();
  const data = await getSettingsPageData();

  return (
    <div className="page-grid">
      <PageHeader title="Настройки" description="Валюта, демо-режим, риск-профиль и целевой размер финансовой подушки." />
      <SourceBanner source={data.source} />
      <SettingsForm data={data} />
      <AccountSection />
      <LocalModePanel />
      <Card>
        <CardHeader>
          <CardTitle>Безопасность и интеграции</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Приложение не хранит банковские логины и пароли и не выполняет screen scraping банков.</p>
          <p>
            Будущие банковские интеграции должны использовать официальные API, явное согласие пользователя и encrypted/secure storage для токенов.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
