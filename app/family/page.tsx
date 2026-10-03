import type { Metadata } from "next";

import { FamilyScreen } from "@/components/family/family-screen";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Семья"
};

// Данные только на устройстве — страница ничего не берёт на сборке.
export default function Page() {
  return (
    <div className="page-grid">
      <PageHeader titleKey="page.family.title" descriptionKey="page.family.desc" />
      <FamilyScreen />
    </div>
  );
}
