import { AccountManager } from "@/components/accounts/account-manager";
import { AccountsSummary } from "@/components/accounts/accounts-summary";
import { FxRatesNote } from "@/components/accounts/fx-rates-note";
import { PageHeader } from "@/components/page-header";
import { getAccountsPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export default async function AccountsPage() {
  await ensureFreshServerData();
  const data = await getAccountsPageData();

  return (
    <div className="page-grid">
      {/* The phone header already names the screen; on a desktop the title row
          still carries the page description and actions. */}
      <div className="hidden md:block">
        <PageHeader titleKey="page.accounts.title" descriptionKey="page.accounts.desc" />
      </div>
      <AccountsSummary data={data} />
      <FxRatesNote accounts={data.accounts} />
      <AccountManager data={data} />
    </div>
  );
}
