import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { BudgetSheet } from "@/components/sheet/budget-sheet";

export const metadata: Metadata = {
  title: "Таблица"
};

// Своя таблица бюджета — как в Excel. Данные только на устройстве, поэтому
// страница ничего не берёт на сборке: всё читает BudgetSheet.
export default function SheetPage() {
  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.sheet.title" descriptionKey="page.sheet.desc" />
      </div>
      <BudgetSheet />
    </div>
  );
}
