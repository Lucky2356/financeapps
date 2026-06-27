"use client";

import { format, subMonths } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import type { BudgetsPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import type { Locale } from "@/lib/i18n/catalog";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

function buildMonthOptions(locale: Locale) {
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = subMonths(new Date(), i);
    const value = format(date, "yyyy-MM");
    const label = format(date, "LLL yyyy", { locale: locale === "en" ? enUS : ru });
    options.push({ value, label });
  }
  return options;
}

export function BudgetManager({ data }: { data: BudgetsPageData }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  // Month selection is purely client-side — no URL params needed.
  // This keeps the budget page statically exportable for Tauri/Capacitor builds.
  const [selectedMonth, setSelectedMonth] = useState(data.selectedMonth);
  const apiPath = `/budgets?month=${selectedMonth}`;
  const { data: pageData, reload } = useApiPageData(data, apiPath);

  const { run } = useApiMutation();
  const confirm = useConfirm();
  const monthOptions = buildMonthOptions(locale);
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
    await run(
      () =>
        apiClient.post("/budgets", {
          categoryId,
          limitAmount: String(limitAmount),
          month: selectedMonth
        }),
      {
        error: t("bud.toast.saveError"),
        onSuccess: refresh
      }
    );
  }

  // Toggle carry-over of the previous month's remainder into this category.
  async function toggleRollover(budget: BudgetsPageData["budgets"][number]) {
    await run(
      () =>
        apiClient.post("/budgets", {
          categoryId: budget.categoryId,
          limitAmount: String(budget.limitAmount),
          rollover: !budget.rollover,
          month: selectedMonth
        }),
      {
        success: budget.rollover ? t("bud.toast.rolloverOff") : t("bud.toast.rolloverOn"),
        error: t("bud.toast.rolloverError"),
        onSuccess: refresh
      }
    );
  }

  async function resetBudget(budget: BudgetsPageData["budgets"][number]) {
    const confirmed = await confirm({
      title: t("bud.reset.title"),
      description: t("bud.reset.desc", { name: budget.category }),
      confirmLabel: t("bud.reset.confirm"),
      destructive: true
    });
    if (!confirmed) return;
    await run(
      () =>
        apiClient.post("/budgets", {
          categoryId: budget.categoryId,
          limitAmount: 0,
          month: selectedMonth
        }),
      {
        success: t("bud.toast.reset"),
        error: t("bud.toast.resetError"),
        onSuccess: refresh
      }
    );
  }

  // Fill limits for categories that have none yet, using the average spend
  // suggestion (history → budgets). Existing limits are left untouched.
  async function fillSuggestedLimits() {
    const targets = pageData.budgets.filter(
      (budget) => budget.limitAmount === 0 && budget.suggestedLimit > 0
    );
    if (targets.length === 0) {
      toast.info(t("bud.toast.noEmpty"));
      return;
    }
    await run(
      async () => {
        for (const budget of targets) {
          await apiClient.post("/budgets", {
            categoryId: budget.categoryId,
            limitAmount: String(budget.suggestedLimit),
            month: selectedMonth
          });
        }
      },
      {
        success: t("bud.toast.filled", { count: targets.length }),
        error: t("bud.toast.fillError"),
        onSuccess: refresh
      }
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{t("bud.title")}</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fillSuggestedLimits}
            title={t("bud.suggestTitle")}
          >
            <Sparkles className="size-4" />
            {t("bud.suggest")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={!hasPrev}
            onClick={() => hasPrev && navigateToMonth(monthOptions[currentIndex - 1].value)}
            aria-label={t("bud.prevMonth")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Select value={selectedMonth} onValueChange={navigateToMonth}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            disabled={!hasNext}
            onClick={() => hasNext && navigateToMonth(monthOptions[currentIndex + 1].value)}
            aria-label={t("bud.nextMonth")}
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
                <TableHead>{t("common.category")}</TableHead>
                <TableHead>{t("bud.progress")}</TableHead>
                <TableHead className="text-right">{t("bud.spent")}</TableHead>
                <TableHead className="min-w-40">{t("bud.limit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.budgets.map((budget) => (
                <TableRow
                  key={budget.categoryId}
                  className={budget.isExceeded ? "bg-destructive/5" : undefined}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/transactions?categoryId=${encodeURIComponent(budget.categoryId)}&type=EXPENSE`}
                      className="inline-flex items-center gap-2 hover:text-primary hover:underline"
                      title={t("acc.showTransactions", { name: budget.category })}
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
                    {budget.rolloverAmount > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("bud.limitWithRollover", {
                          total: formatCurrency(
                            budget.limitAmount + budget.rolloverAmount,
                            pageData.currency
                          ),
                          roll: formatCurrency(budget.rolloverAmount, pageData.currency)
                        })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <BudgetForm
                      budget={budget}
                      currency={pageData.currency}
                      onSave={saveLimit}
                      onReset={() => resetBudget(budget)}
                      onToggleRollover={() => toggleRollover(budget)}
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
                <span>
                  {formatCurrency(budget.limitAmount + budget.rolloverAmount, pageData.currency)}
                  {budget.rolloverAmount > 0 ? (
                    <span className="ml-1 text-xs">
                      (+{formatCurrency(budget.rolloverAmount, pageData.currency)})
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-3">
                <BudgetForm
                  budget={budget}
                  currency={pageData.currency}
                  onSave={saveLimit}
                  onReset={() => resetBudget(budget)}
                  onToggleRollover={() => toggleRollover(budget)}
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
  currency,
  onSave,
  onReset,
  onToggleRollover
}: {
  budget: BudgetsPageData["budgets"][number];
  currency: string;
  onSave: (categoryId: string, limit: number) => void;
  onReset: () => void;
  onToggleRollover?: () => void;
}) {
  const { t } = useI18n();
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
          placeholder={t("bud.noLimit")}
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
          title={t("bud.resetLimit")}
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
          title={t("bud.bySuggestTitle")}
        >
          {t("bud.bySuggest", { amount: formatCurrency(budget.suggestedLimit, currency) })}
        </button>
      ) : null}
      {onToggleRollover && budget.limitAmount > 0 ? (
        <label
          className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground"
          title={t("bud.rolloverTitle")}
        >
          <input
            type="checkbox"
            checked={budget.rollover}
            onChange={onToggleRollover}
            className="size-3.5 accent-primary"
          />
          {t("bud.rolloverLabel")}
        </label>
      ) : null}
    </div>
  );
}
