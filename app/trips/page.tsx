import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { TripsScreen } from "@/components/trips/trips-screen";

export const metadata: Metadata = {
  title: "Поездки"
};

// Данные только на устройстве — страница ничего не берёт на сборке.
export default function Page() {
  return (
    <div className="page-grid">
      <PageHeader titleKey="page.trips.title" descriptionKey="page.trips.desc" />
      <TripsScreen />
    </div>
  );
}
