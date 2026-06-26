import { AccountManager } from "@/components/accounts/account-manager";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getAccountsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function AccountsPage() {
  await ensureFreshServerData();
  const data = await getAccountsPageData();

  return (
    <div className="page-grid">
      <PageHeader titleKey="page.accounts.title" descriptionKey="page.accounts.desc" />
      <SourceBanner source={data.source} />
      <AccountManager data={data} />
    </div>
  );
}
