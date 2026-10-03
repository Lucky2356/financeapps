import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";

import { Workbook } from "@/components/sheet/workbook";

export const metadata: Metadata = {
  title: "Таблица"
};

// Своя таблица бюджета — как в Excel. Данные только на устройстве, поэтому
// страница ничего не берёт на сборке: всё читает книга таблиц (Workbook).
export default function SheetPage() {
  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.sheet.title" descriptionKey="page.sheet.desc" />
      </div>
      {/* Лист — в адресе (?sheet=), а адрес статической сборке известен только
          в браузере: отсюда Suspense. */}
      <Suspense fallback={null}>
        <Workbook />
      </Suspense>
    </div>
  );
}
