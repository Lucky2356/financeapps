"use client";

// «Список / Календарь» в «Учёте». Выбор — в адресе (?view=calendar): кнопка
// «назад» возвращает к тому виду, где был человек, а ссылку на календарь
// можно открыть сразу.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { TransactionsCalendar } from "@/components/transactions/transactions-calendar";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n/context";

type View = "list" | "calendar";

export function LedgerViews({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: View = params.get("view") === "calendar" ? "calendar" : "list";

  function choose(next: View) {
    const query = new URLSearchParams(params.toString());
    if (next === "calendar") query.set("view", "calendar");
    else query.delete("view");
    const suffix = query.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel={t("cal.view")}
        className="w-full sm:w-72"
        value={view}
        onChange={choose}
        options={[
          { value: "list", label: t("cal.list") },
          { value: "calendar", label: t("cal.calendar") }
        ]}
      />
      {view === "calendar" ? <TransactionsCalendar /> : children}
    </div>
  );
}
