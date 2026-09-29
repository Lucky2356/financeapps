import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { DeductionsScreen } from "@/components/deductions/deductions-screen";

export const metadata: Metadata = {
  title: "Налоговые вычеты"
};

// Данные только на устройстве — страница ничего не берёт на сборке.
export default function Page() {
  return (
    <div className="page-grid">
      <PageHeader titleKey="page.deductions.title" descriptionKey="page.deductions.desc" />
      <DeductionsScreen />
    </div>
  );
}
