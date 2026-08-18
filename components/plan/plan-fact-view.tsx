"use client";

import { useState } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { TransfersToggle } from "@/components/analytics/transfers-toggle";
import { AmountInput } from "@/components/ui/amount-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { transfersQuery, useIncludeTransfers } from "@/hooks/use-include-transfers";
import { apiClient } from "@/lib/api/client";
import { OPENING_BALANCE_ID } from "@/lib/api/LocalApiClient";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PlanFactPageData, PlanFactRow, PlanFactTotals } from "@/types/finance";

// Plan against fact for one month. The plan column is the only thing typed in;
// everything else is read off the ledger, so the table cannot drift from the
// operations the way a spreadsheet kept beside the app does.
export function PlanFactView({ initialData }: { initialData: PlanFactPageData }) {
  const { t, locale } = useI18n();
  const [includeTransfers, setIncludeTransfers] = useIncludeTransfers();
  const [month, setMonth] = useState(initialData.month);
  const { data, reload } = useApiPageData(
    initialData,
    `/plan?month=${month}${transfersQuery(includeTransfers, "&")}`
  );
  const { run } = useApiMutation();

  async function savePlan(categoryId: string, amount: number) {
    await run(() => apiClient.post("/plan", { month, categoryId, amount: String(amount) }), {
      success: t("plan.saved"),
      error: t("plan.saveError"),
      onSuccess: reload
    });
  }

  async function saveNote(note: string) {
    await run(() => apiClient.post("/plan", { month, note }), {
      success: t("plan.saved"),
      error: t("plan.saveError"),
      onSuccess: reload
    });
  }

  const monthLabel = (key: string) => {
    const [year, index] = key.split("-").map(Number);
    return new Date(year, index - 1, 1).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
      month: "long",
      year: "numeric"
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="plan-month">{t("plan.month")}</Label>
          <select
            id="plan-month"
            value={data.month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {data.months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </div>
        <TransfersToggle checked={includeTransfers} onChange={setIncludeTransfers} />
      </div>

      <PlanSection
        title={t("plan.income")}
        rows={data.income}
        totals={data.totals.income}
        currency={data.currency}
        month={data.month}
        onSave={savePlan}
        // Earning less than planned is the bad direction, so the sign that
        // reads as "good" is the opposite of the spending table's.
        goodWhenNegative
        empty={t("plan.noIncome")}
      />

      <PlanSection
        title={t("plan.expense")}
        rows={data.expense}
        totals={data.totals.expense}
        currency={data.currency}
        month={data.month}
        onSave={savePlan}
        empty={t("plan.noExpense")}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("plan.result")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">{t("plan.line")}</th>
                  <th className="py-2 text-right">{t("plan.plan")}</th>
                  <th className="py-2 text-right">{t("plan.fact")}</th>
                  <th className="py-2 text-right">{t("plan.diff")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2">
                    <span>{t("plan.opening")}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("plan.opening.hint")}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <PlanCell
                      key={`${data.month}-opening`}
                      value={data.totals.opening.plan}
                      onSave={(amount) => savePlan(OPENING_BALANCE_ID, amount)}
                    />
                  </td>
                  <td className="num py-2 text-right">
                    {formatCurrency(data.totals.opening.fact, data.currency)}
                  </td>
                  <td className="num py-2 text-right text-muted-foreground">
                    {formatCurrency(data.totals.opening.diff, data.currency)}
                  </td>
                </tr>
                <TotalRow
                  label={t("plan.income")}
                  totals={data.totals.income}
                  currency={data.currency}
                  goodWhenNegative
                />
                <TotalRow
                  label={t("plan.expense")}
                  totals={data.totals.expense}
                  currency={data.currency}
                />
                <TotalRow
                  label={t("plan.result")}
                  totals={data.totals.result}
                  currency={data.currency}
                  goodWhenNegative
                  strong
                />
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-note">{t("plan.note")}</Label>
            <NoteField key={data.month} initial={data.note} onSave={saveNote} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanSection({
  title,
  rows,
  totals,
  currency,
  onSave,
  month,
  goodWhenNegative = false,
  empty
}: {
  title: string;
  rows: PlanFactRow[];
  totals: PlanFactTotals;
  currency: string;
  month: string;
  onSave: (categoryId: string, amount: number) => Promise<void>;
  goodWhenNegative?: boolean;
  empty: string;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">{t("common.category")}</th>
                  <th className="py-2 text-right">{t("plan.plan")}</th>
                  <th className="py-2 text-right">{t("plan.fact")}</th>
                  <th className="py-2 text-right">{t("plan.diff")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${month}-${row.categoryId}`} className="border-b last:border-0">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: row.color }}
                        >
                          <CategoryIcon name={row.icon} className="size-3" />
                        </span>
                        <span className="truncate">{row.category}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <PlanCell
                        value={row.plan}
                        onSave={(amount) => onSave(row.categoryId, amount)}
                      />
                    </td>
                    <td className="num py-2 text-right">{formatCurrency(row.fact, currency)}</td>
                    <td
                      className={cn(
                        "num py-2 text-right",
                        diffTone(row.diff, goodWhenNegative, row.plan)
                      )}
                    >
                      {formatCurrency(row.diff, currency)}
                    </td>
                  </tr>
                ))}
                <TotalRow
                  label={t("plan.total")}
                  totals={totals}
                  currency={currency}
                  goodWhenNegative={goodWhenNegative}
                  strong
                />
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TotalRow({
  label,
  totals,
  currency,
  goodWhenNegative = false,
  strong = false
}: {
  label: string;
  totals: PlanFactTotals;
  currency: string;
  goodWhenNegative?: boolean;
  strong?: boolean;
}) {
  return (
    <tr className={cn("border-t", strong && "font-semibold")}>
      <td className="py-2">{label}</td>
      <td className="num py-2 text-right">{formatCurrency(totals.plan, currency)}</td>
      <td className="num py-2 text-right">{formatCurrency(totals.fact, currency)}</td>
      <td
        className={cn("num py-2 text-right", diffTone(totals.diff, goodWhenNegative, totals.plan))}
      >
        {formatCurrency(totals.diff, currency)}
      </td>
    </tr>
  );
}

// A gap only means something when there was a plan to miss; without one the
// figure is just "everything you spent", and colouring it red would be a
// verdict on a decision never made.
function diffTone(diff: number, goodWhenNegative: boolean, plan: number): string {
  if (plan === 0 || diff === 0) return "text-muted-foreground";
  const good = goodWhenNegative ? diff < 0 : diff > 0;
  return good ? "text-success" : "text-destructive";
}

// The plan cell commits on blur (and on Enter): typing a five-digit sum should
// not write five times, once per keystroke. The draft lives here rather than in
// the page, so a slow save never yanks half-typed digits out from under you —
// callers remount the cell (via `key`) when the month changes and the figure
// underneath it is a different one.
function PlanCell({ value, onSave }: { value: number; onSave: (amount: number) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : "");

  function commit() {
    const amount = Number(draft.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setDraft(value ? String(value) : "");
      return;
    }
    if (amount !== value) onSave(amount);
  }

  // The field carries its own calculator button, and that button anchors to the
  // right edge of the field's wrapper — so the wrapper is what has to be narrow
  // and right-aligned, or the button drifts across the table away from the box
  // it belongs to.
  return (
    <div className="ml-auto w-36">
      <AmountInput
        value={draft}
        onValueChange={setDraft}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="h-9 text-right"
        placeholder="0"
        inputMode="decimal"
      />
    </div>
  );
}

function NoteField({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);

  return (
    <Input
      id="plan-note"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== initial) onSave(draft);
      }}
      placeholder={t("plan.note.placeholder")}
      maxLength={500}
    />
  );
}
