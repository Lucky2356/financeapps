"use client";

import { format, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Save, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { BudgetsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function buildMonthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = subMonths(new Date(), i);
    const value = format(date, "yyyy-MM");
    const label = format(date, "LLL yyyy", { locale: ru });
    options.push({ value, label });
  }
  return options;
}

export function BudgetManager({ data }: { data: BudgetsPageData }) {
  const router = useRouter();
  // Month selection is purely client-side — no URL params needed.
  // This keeps the budget page statically exportable for Tauri/Capacitor builds.
  const [selectedMonth, setSelectedMonth] = useState(data.selectedMonth);
  const apiPath = `/budgets?month=${selectedMonth}`;
  const { data: pageData, reload } = useApiPageData(data, apiPath);

  const monthOptions = buildMonthOptions();
  const currentIndex = monthOptions.findIndex((option) => option.value === selectedMonth);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < monthOptions.length - 1;

  function navigateToMonth(monthValue: string) {
    setSelectedMonth(monthValue);
    // apiPath will update → useApiPageData effect re-fetches for new month
  }

  async function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      await apiClient.post("/budgets", payload);
      toast.success("Лимит бюджета сохранен");
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить лимит");
    }
  }

  async function resetBudget(budget: BudgetsPageData["budgets"][number]) {
    if (!window.confirm(`Сбросить лимит для «${budget.category}»?`)) return;
    try {
      await apiClient.post("/budgets", { categoryId: budget.categoryId, limitAmount: 0 });
      toast.success("Лимит сброшен");
      await reload();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сбросить лимит");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Лимиты по категориям</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={!hasPrev}
            onClick={() => hasPrev && navigateToMonth(monthOptions[currentIndex - 1].value)}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <select
            value={selectedMonth}
            onChange={(event) => navigateToMonth(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            disabled={!hasNext}
            onClick={() => hasNext && navigateToMonth(monthOptions[currentIndex + 1].value)}
            aria-label="Следующий месяц"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Категория</TableHead>
                <TableHead>Прогресс</TableHead>
                <TableHead className="text-right">Потрачено</TableHead>
                <TableHead className="min-w-40">Лимит</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.budgets.map((budget) => (
                <TableRow key={budget.categoryId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/transactions?categoryId=${encodeURIComponent(budget.categoryId)}&type=EXPENSE`}
                      className="inline-flex items-center gap-2 hover:text-primary hover:underline"
                      title={`Показать операции: ${budget.category}`}
                    >
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: budget.color }} />
                      {budget.category}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress value={Math.min(budget.progress, 100)} className="h-2" />
                      <span className={budget.isExceeded ? "w-14 text-right text-sm font-semibold text-destructive" : "w-14 text-right text-sm text-muted-foreground"}>
                        {Math.round(budget.progress)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(budget.spent, pageData.currency)}</TableCell>
                  <TableCell>
                    <BudgetForm budget={budget} onSubmit={submitBudget} onReset={() => resetBudget(budget)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:hidden">
          {pageData.budgets.map((budget) => (
            <div key={budget.categoryId} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/transactions?categoryId=${encodeURIComponent(budget.categoryId)}&type=EXPENSE`}
                  className="font-semibold hover:text-primary hover:underline"
                >
                  {budget.category}
                </Link>
                <p className={budget.isExceeded ? "font-semibold text-destructive" : "font-semibold"}>
                  {Math.round(budget.progress)}%
                </p>
              </div>
              <Progress value={Math.min(budget.progress, 100)} className="mt-3" />
              <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                <span>{formatCurrency(budget.spent, pageData.currency)}</span>
                <span>{formatCurrency(budget.limitAmount, pageData.currency)}</span>
              </div>
              <div className="mt-3">
                <BudgetForm budget={budget} onSubmit={submitBudget} onReset={() => resetBudget(budget)} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetForm({
  budget,
  onSubmit,
  onReset
}: {
  budget: BudgetsPageData["budgets"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input type="hidden" name="categoryId" value={budget.categoryId} />
      <Input name="limitAmount" type="number" min="0" step="100" defaultValue={budget.limitAmount} className="min-w-0" />
      <Button type="submit" size="icon" variant="outline" title="Сохранить лимит">
        <Save className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="outline" title="Сбросить лимит" onClick={onReset}>
        <X className="size-4" />
      </Button>
    </form>
  );
}
