import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { CashbackScreen } from "@/components/cashback/cashback-screen";

export const metadata: Metadata = {
  title: "Кэшбэк"
};

// Данные только на устройстве — страница ничего не берёт на сборке.
export default function Page() {
  return (
    <div className="page-grid">
      <PageHeader titleKey="page.cashback.title" descriptionKey="page.cashback.desc" />
      <CashbackScreen />
    </div>
  );
}
