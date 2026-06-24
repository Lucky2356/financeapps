"use client";

import { format, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { BudgetsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

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

  const { run } = useApiMutation();
  const confirm = useConfirm();
  const monthOptions = buildMonthOptions();
  const currentIndex = monthOptions.findIndex((option) => option.value === selectedMonth);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < monthOptions.length - 1;

  async function refresh() {
    await reload();
    router.refresh();
  }

  function navigateToMonth(monthValue: string) {
    setSelectedMonth(monthValue);
    // apiPath will update → useApiPageData effect re-fetches for new month
  }

  // Auto-save a single category limit (no explicit save button; silent success).
  async function saveLimit(categoryId: string, limitAmount: number) {
    await run(() => apiClient.post("/budgets", { categoryId, limitAmount: String(limitAmount) }), {
      error: "Не удалось сохранить лимит",
      onSuccess: refresh
    });
  }

  async function resetBudget(budget: BudgetsPageData["budgets"][number]) {
    const confirmed = await confirm({
      title: "Сбросить лимит?",
      description: `Лимит для категории «${budget.category}» будет удалён.`,
      confirmLabel: "Сбросить",
      destructive: true
    });
    if (!confirmed) return;
    await run(() => apiClient.post("/budgets", { categoryId: budget.categoryId, limitAmount: 0 }), {
      success: "Лимит сброшен",
      error: "Не удалось сбросить лимит",
      onSuccess: refresh
    });
  }

  // Fill limits for categories that have none yet, using the average spend
  // suggestion (history → budgets). Existing limits are left untouched.
  async function fillSuggestedLimits() {
    const targets = pageData.budgets.filter(
      (budget) => budget.limitAmount === 0 && budget.suggestedLimit > 0
    );
    if (targets.length === 0) {
      toast.info("Нет пустых категорий с историей трат для подсказки.");
      return;
    }
    await run(
      async () => {
        for (const budget of targets) {
          await apiClient.post("/budgets", {
            categoryId: budget.categoryId,
            limitAmount: String(budget.suggestedLimit)
          });
        }
      },
      {
        success: `Лимиты заполнены по средним тратам: ${targets.length}`,
        error: "Не удалось применить предложения",
        onSuccess: refresh
      }
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Лимиты по категориям</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fillSuggestedLimits}
            title="Заполнить пустые лимиты по средним тратам за 3 месяца"
          >
            <Sparkles className="size-4" />
            Предложить лимиты
          </Button>
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
                <TableRow key={budget.categoryId} className={budget.isExceeded ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/transactions?categoryId=${encodeURIComponent(budget.categoryId)}&type=EXPENSE`}
                      className="inline-flex items-center gap-2 hover:text-primary hover:underline"
                      title={`Показать операции: ${budget.category}`}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: budget.color }}
                      />
                      {budget.category}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={Math.min(budget.progress, 100)}
                        className="h-2"
                        indicatorClassName={budget.isExceeded ? "bg-destructive" : undefined}
                      />
                      <span
                        className={
                          budget.isExceeded
                            ? "w-14 text-right text-sm font-semibold text-destructive"
                            : "w-14 text-right text-sm text-muted-foreground"
                        }
                      >
                        {Math.round(budget.progress)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(budget.spent, pageData.currency)}
                  </TableCell>
                  <TableCell>
                    <BudgetForm
                      budget={budget}
                      onSave={saveLimit}
                      onReset={() => resetBudget(budget)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:hidden">
          {pageData.budgets.map((budget) => (
            <div
              key={budget.categoryId}
              className={
                budget.isExceeded
                  ? "rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                  : "rounded-lg border p-4"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/transactions?categoryId=${encodeURIComponent(budget.categoryId)}&type=EXPENSE`}
                  className="font-semibold hover:text-primary hover:underline"
                >
                  {budget.category}
                </Link>
                <p
                  className={budget.isExceeded ? "font-semibold text-destructive" : "font-semibold"}
                >
                  {Math.round(budget.progress)}%
                </p>
              </div>
              <Progress
                value={Math.min(budget.progress, 100)}
                className="mt-3"
                indicatorClassName={budget.isExceeded ? "bg-destructive" : undefined}
              />
              <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                <span>{formatCurrency(budget.spent, pageData.currency)}</span>
                <span>{formatCurrency(budget.limitAmount, pageData.currency)}</span>
              </div>
              <div className="mt-3">
                <BudgetForm
                  budget={budget}
                  onSave={saveLimit}
                  onReset={() => resetBudget(budget)}
                />
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
  onSave,
  onReset
}: {
  budget: BudgetsPageData["budgets"][number];
  onSave: (categoryId: string, limit: number) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState(budget.limitAmount ? String(budget.limitAmount) : "");
  // Re-sync when the saved value changes (month switch / reload).
  const [synced, setSynced] = useState(budget.limitAmount);
  if (synced !== budget.limitAmount) {
    setSynced(budget.limitAmount);
    setValue(budget.limitAmount ? String(budget.limitAmount) : "");
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSuggestion = budget.suggestedLimit > 0 && budget.suggestedLimit !== budget.limitAmount;

  function commit(next: string) {
    const num = Number(next || 0);
    if (num === budget.limitAmount) return; // no change
    onSave(budget.categoryId, num);
  }

  function handleChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), 700); // debounce auto-save
  }

  function applySuggestion() {
    if (timer.current) clearTimeout(timer.current);
    setValue(String(budget.suggestedLimit));
    onSave(budget.categoryId, budget.suggestedLimit);
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          name="limitAmount"
          type="number"
          min="0"
          step="100"
          value={value}
          placeholder="нет лимита"
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            commit(value);
          }}
          className="min-w-0"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          title="Сбросить лимит"
          onClick={onReset}
        >
          <X className="size-4" />
        </Button>
      </div>
      {showSuggestion ? (
        <button
          type="button"
          onClick={applySuggestion}
          className="text-[11px] text-primary hover:underline"
          title="Применить лимит по средним тратам за 3 месяца"
        >
          по средним: {budget.suggestedLimit.toLocaleString("ru-RU")} ₽
        </button>
      ) : null}
    </div>
  );
}
