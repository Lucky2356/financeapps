"use client";

// «Налоговые вычеты»: сколько НДФЛ можно вернуть за год, какие категории идут
// в вычет и список операций для декларации.

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useExtrasText } from "@/components/extras/extras-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { apiClient } from "@/lib/api/client";
import type { DeductionsPageData } from "@/lib/api/local/extras";
import type { CategoriesPageData } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import { createFileSystemAdapter } from "@/lib/files/createFileSystemAdapter";
import { DEDUCTION_KINDS, deductionCsv, type DeductionKind } from "@/lib/tax/deductions";

const NONE = "none";

export function DeductionsScreen() {
  const { words, format, locale } = useExtrasText();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, reload } = useApiPageData<DeductionsPageData>(
    {
      year,
      lines: [],
      possible: 0,
      taxPaid: null,
      refund: 0,
      cappedByTax: false,
      taxEstimated: false,
      children: 1,
      operations: [],
      marked: []
    },
    `/deductions?year=${year}`
  );
  const { data: categoriesData, reload: reloadCategories } = useApiPageData<CategoriesPageData>(
    { source: "database", categories: [] },
    "/categories"
  );
  const categories = categoriesData.categories.filter((category) => category.kind === "EXPENSE");
  const kindOf = new Map(data.marked.map((mark) => [mark.categoryId, mark.kind]));
  const money = (value: number) => formatCurrency(value);
  const date = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(
      locale === "en" ? "en-GB" : "ru-RU",
      { day: "numeric", month: "short" }
    );

  async function mark(categoryId: string, kind: string) {
    await apiClient.post("/deductions", {
      action: "mark",
      categoryId,
      kind: kind === NONE ? null : kind
    });
    await Promise.all([reload(), reloadCategories()]);
  }

  async function saveYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiClient.post("/deductions", { ...form, year });
      toast.success(words.dSaved);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportCsv() {
    const csv = deductionCsv(data.operations, year, words.kind);
    try {
      const saved = await createFileSystemAdapter().saveTextFile(
        `vychety-${year}.csv`,
        csv,
        "text/csv"
      );
      if (saved !== false) toast.success(words.dExported);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="−1" onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-16 text-center font-semibold tabular-nums">{year}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="+1"
          disabled={year >= new Date().getFullYear()}
          onClick={() => setYear((y) => y + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-sm text-muted-foreground">{words.dRefund}</p>
            <p
              className="text-3xl font-semibold tabular-nums text-success"
              data-testid="deduction-refund"
            >
              {money(data.refund)}
            </p>
            <p className="text-xs text-muted-foreground">{words.dRefundHint}</p>
            {data.cappedByTax ? (
              <p className="text-xs text-warning">
                {format(words.dPossible, {
                  amount: money(data.possible),
                  tax: money(data.taxPaid ?? 0)
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <form
              key={`${year}-${data.taxPaid}-${data.children}`}
              onSubmit={(event) => void saveYear(event)}
              className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            >
              <div className="space-y-1">
                <Label htmlFor="tax-paid">{words.dTaxPaid}</Label>
                <Input
                  id="tax-paid"
                  name="taxPaid"
                  inputMode="decimal"
                  placeholder={data.taxPaid === null ? "0" : undefined}
                  defaultValue={data.taxEstimated ? "" : (data.taxPaid ?? "")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="children">{words.dChildren}</Label>
                <Input
                  id="children"
                  name="children"
                  type="number"
                  min={1}
                  max={20}
                  className="w-20"
                  defaultValue={data.children}
                />
              </div>
              <Button type="submit" variant="outline">
                {words.dSaveYear}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.taxPaid === null
                ? words.dTaxUnknown
                : data.taxEstimated
                  ? `${money(data.taxPaid)} — ${words.dTaxEstimated}`
                  : null}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.lines.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{words.dLines}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lines.map((line) => (
              <div key={line.group} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{words.group[line.group]}</span>
                  <span className="font-semibold tabular-nums text-success">
                    +{money(line.refund)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(words.dSpent, { spent: money(line.spent) })} ·{" "}
                  {line.limit === null
                    ? words.dNoLimit
                    : format(words.dLimit, { limit: money(line.limit) })}
                </p>
                {line.limit !== null ? (
                  <Progress value={Math.min((line.spent / line.limit) * 100, 100)} />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{words.dCategories}</CardTitle>
          <p className="text-xs text-muted-foreground">{words.dCategoriesHint}</p>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="truncate">{category.name}</span>
                </span>
                <Select
                  value={kindOf.get(category.id) ?? NONE}
                  onValueChange={(value) => void mark(category.id, value)}
                >
                  <SelectTrigger
                    className="h-8 w-full shrink-0 text-xs sm:w-44"
                    aria-label={category.name}
                    data-testid={`deduction-kind-${category.name}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{words.dNotDeductible}</SelectItem>
                    {DEDUCTION_KINDS.map((kind: DeductionKind) => (
                      <SelectItem key={kind} value={kind}>
                        {words.kind[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">{words.dOperations}</CardTitle>
          {data.operations.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
              <Download className="size-4" />
              {words.dExport}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {data.operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{words.dNoOperations}</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.operations.slice(0, 50).map((operation) => (
                <li key={operation.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {operation.description || operation.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {date(operation.date)} · {words.kind[operation.kind]}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{money(operation.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{words.dNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}
