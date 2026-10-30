"use client";

import { format } from "date-fns";
import type { ReactNode } from "react";
import { useState } from "react";

import { BudgetManager } from "@/components/budgets/budget-manager";
import { BudgetsSummary } from "@/components/budgets/budgets-summary";
import type { BudgetsPageData } from "@/lib/data";

// Итоги наверху и список лимитов ниже — про один и тот же месяц. Выбор месяца
// живёт здесь, а не в списке: раньше шапка всегда читала текущий месяц, и после
// выбора сентября над сентябрьским списком стояли октябрьские цифры.
//
// Месяц — по часам устройства, а не из `data` (см. BudgetManager): оболочку
// страницы собирают при сборке приложения.
export function BudgetsScreen({ data, between }: { data: BudgetsPageData; between?: ReactNode }) {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  return (
    <>
      <BudgetsSummary data={data} month={month} />
      {between}
      <BudgetManager data={data} month={month} onMonthChange={setMonth} />
    </>
  );
}
