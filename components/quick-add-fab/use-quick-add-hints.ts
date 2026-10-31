"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { limitHint } from "@/lib/budget-limit-hint";
import { bestCard, rateFor } from "@/lib/cashback/cashback";
import type { BudgetsPageData } from "@/lib/data";
import { formatInputDate } from "@/lib/format";

import { splitRemainder, toNumber } from "@/components/quick-add-fab/helpers";
import type { QuickAddForm } from "@/components/quick-add-fab/use-quick-add-form";

/** Подсказки под полями: выгоднее карта, идёт поездка, сколько осталось в лимите. */
export function useQuickAddHints(form: QuickAddForm) {
  const { open, type, date, categoryId, accountId, cashback, trip, amount, splitParts } = form;
  const { activeAccounts } = form;
  // Лимиты месяца операции — для подсказки «осталось в лимите» под категорией.
  const [limits, setLimits] = useState<{
    month: string;
    rows: BudgetsPageData["budgets"];
  } | null>(null);

  // Какой картой выгоднее — по условиям кэшбэка месяца операции.
  const operationMonth = (date || formatInputDate(new Date())).slice(0, 7);
  const best =
    type === "EXPENSE" && categoryId ? bestCard(cashback, categoryId, operationMonth) : null;
  const currentRate =
    accountId && categoryId
      ? (rateFor(cashback, accountId, categoryId, operationMonth)?.percent ?? 0)
      : 0;
  const bestAccount = best ? activeAccounts.find((a) => a.id === best.accountId) : undefined;
  const betterCard =
    best && bestAccount && best.accountId !== accountId && best.percent > currentRate
      ? { id: bestAccount.id, name: bestAccount.name, percent: best.percent }
      : null;
  const operationDay = date || formatInputDate(new Date());
  const tripHere =
    type === "EXPENSE" && trip && trip.from <= operationDay && operationDay <= trip.to
      ? trip
      : null;

  // Лимиты читаются, пока окно открыто и это расход: за месяц операции — она
  // может быть и вчерашней, из прошлого месяца.
  useEffect(() => {
    if (!open || type !== "EXPENSE") return;
    let alive = true;
    void apiClient
      .get(`/budgets?month=${operationMonth}`)
      .then((result) => {
        if (alive) setLimits({ month: operationMonth, rows: result.budgets });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, type, operationMonth]);

  // Сколько осталось в лимите категории — до траты, с уже набранной суммой.
  const limitRow =
    limits?.month === operationMonth
      ? limits.rows.find((row) => row.categoryId === categoryId)
      : undefined;
  const limitNote =
    type === "EXPENSE" && categoryId
      ? limitHint(
          limitRow,
          splitParts.length > 0 ? Math.max(splitRemainder(amount, splitParts), 0) : toNumber(amount)
        )
      : null;

  return { betterCard, tripHere, limitNote };
}
