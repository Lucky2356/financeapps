import { AccountManager } from "@/components/accounts/account-manager";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
import { getAccountsPageData } from "@/lib/data";

export default async function AccountsPage() {
  const data = await getAccountsPageData();

  return (
    <div className="page-grid">
      <PageHeader title="Счета" description="Наличные, карта, накопительный и брокерский счет с расчетом общего баланса." />
      <SourceBanner source={data.source} />
      <AccountManager data={data} />
    </div>
  );
}
