import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { WhatIfScreen } from "@/components/whatif/what-if-screen";

export const metadata: Metadata = {
  title: "Что если"
};

// Данные только на устройстве — страница ничего не берёт на сборке.
export default function Page() {
  return (
    <div className="page-grid">
      <PageHeader titleKey="page.whatIf.title" descriptionKey="page.whatIf.desc" />
      <WhatIfScreen />
    </div>
  );
}
