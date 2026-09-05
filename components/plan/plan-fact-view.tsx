"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useRef, useState, type ReactNode, type ThHTMLAttributes } from "react";
import { toast } from "sonner";

import { AmountDrilldown } from "@/components/drilldown/amount-drilldown";
import { TransfersToggle } from "@/components/analytics/transfers-toggle";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiPageData } from "@/hooks/use-api-page-data";
import { transfersQuery, useIncludeTransfers } from "@/hooks/use-include-transfers";
import { apiClient } from "@/lib/api/client";
import { OPENING_BALANCE_ID, SAVINGS_BALANCE_ID } from "@/lib/api/LocalApiClient";
import { formatCurrency } from "@/lib/format";
import { periodRange } from "@/lib/transactions/filter-chips";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type {
  PlanFactCell,
  PlanFactColumn,
  PlanFactMonth,
  PlanFactPageData,
  PlanFactSplit
} from "@/types/finance";

/** "2026-08" for a date, the same key the plan grid is indexed by. */
function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The first and last day of a "2026-08" month, as the operations list wants them. */
function monthRange(key: string): { from: string; to: string } {
  const [year, index] = key.split("-").map(Number);
  const last = new Date(year, index, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

// Plan against fact, laid out like the spreadsheet this screen replaces: every
// category is a column, every month a row, in three bands — plan, fact and the
// gap between them. Only the plan band is typed in; the other two are read off
// the ledger, so the table cannot drift from the operations behind it.
export function PlanFactView({ initialData }: { initialData: PlanFactPageData }) {
  const { t, locale } = useI18n();
  const [includeTransfers, setIncludeTransfers] = useIncludeTransfers();
  // Months with operations show up on their own. Any other month — next month
  // to plan ahead, or an earlier one to fill in by hand — is pinned into the
  // grid and stored with the data, so it is there on the next device too.
  const { data, reload } = useApiPageData(
    initialData,
    `/plan${transfersQuery(includeTransfers, "?")}`
  );
  const { run } = useApiMutation();
  const confirm = useConfirm();

  // Which months are on screen. The grid holds every month the ledger touches,
  // and after a year of use that is a long table to scroll through to reach the
  // one being planned — so it opens on the month in progress, the one the
  // question is nearly always about, rather than on all of them at once.
  //
  // The ends are dates, like every other period in the app, even though the
  // rows are months: a month is shown when the period touches any part of it.
  // Two month dropdowns made this the one screen where a period meant something
  // else than it does everywhere else.
  const thisMonth = periodRange("thisMonth");
  const [from, setFrom] = useState(thisMonth?.from ?? "");
  const [to, setTo] = useState(thisMonth?.to ?? "");

  // One dialog for the whole grid rather than one per cell: a month of a dozen
  // categories is a few hundred cells, and each carrying its own closed dialog
  // is a few hundred subscriptions for the one that gets opened.
  const [drill, setDrill] = useState<DrilldownTarget | null>(null);

  const income = data.columns.filter((column) => column.kind === "INCOME");
  const expense = data.columns.filter((column) => column.kind === "EXPENSE");
  // month + opening(2) + income cols + income total(2) + expense cols +
  // expense total(2) + result(2) + note
  const width = income.length + expense.length + 10;

  const months = data.months.filter(
    (month) => (!from || month.month >= from.slice(0, 7)) && (!to || month.month <= to.slice(0, 7))
  );
  async function addMonth(month: string) {
    await run(() => apiClient.post("/plan", { action: "addMonth", month }), {
      success: t("plan.monthAdded"),
      error: t("plan.saveError"),
      onSuccess: reload
    });
  }

  async function removeMonth(month: string) {
    const confirmed = await confirm({
      title: t("plan.remove.title"),
      description: t("plan.remove.desc", { month: monthLabel(month) }),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) return;
    await run(
      () => apiClient.post<{ hasFacts?: boolean }>("/plan", { action: "removeMonth", month }),
      {
        success: t("plan.removed"),
        error: t("plan.saveError"),
        onSuccess: async (result) => {
          if (result?.hasFacts) toast.info(t("plan.removeKeptFacts"));
          await reload();
        }
      }
    );
  }

  async function save(body: Record<string, string>) {
    await run(() => apiClient.post("/plan", body), {
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

  const money = (value: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "ru-RU", {
      maximumFractionDigits: 0
    }).format(value);

  // The grid carries bare numbers — a currency sign in each of a few hundred
  // cells is noise — so the unit is stated once, above the table.
  const unit = formatCurrency(0, data.currency).replace(/[\d\s.,]/g, "");

  if (data.columns.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("plan.empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("plan.units", { currency: unit })}</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Which months to show, in the app's own controls: the native month
              fields were the only two OS-drawn widgets on the screen, and they
              looked it. The lists carry the months the grid actually has. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("plan.period")}</span>
            <Input
              type="date"
              aria-label={t("plan.periodFrom")}
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-[9.5rem] px-2"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              aria-label={t("plan.periodTo")}
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className="h-9 w-[9.5rem] px-2"
            />
            {from || to ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t("plan.periodReset")}
                title={t("plan.periodReset")}
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>

          <TransfersToggle checked={includeTransfers} onChange={setIncludeTransfers} />

          {/* One button, and the months to choose from underneath it — instead
              of a date field to fill in before pressing it. */}
          <AddMonthDialog
            present={new Set(data.months.map((month) => month.month))}
            onPick={(month) => void addMonth(month)}
          />
        </div>
      </div>

      {months.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("plan.noMonths")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto" data-testid="plan-grid">
              <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <Head rowSpan={2} className="sticky left-0 z-20 text-left">
                      {t("plan.month")}
                    </Head>
                    <Head
                      colSpan={2}
                      className="border-l text-center"
                      title={t("plan.opening.hint")}
                    >
                      {t("plan.opening")}
                    </Head>
                    <Head colSpan={income.length + 2} className="border-l text-center">
                      {t("plan.income")}
                    </Head>
                    <Head colSpan={expense.length + 2} className="border-l text-center">
                      {t("plan.expense")}
                    </Head>
                    <Head colSpan={2} className="border-l text-center">
                      {t("plan.result")}
                    </Head>
                    <Head rowSpan={2} className="border-l text-left">
                      {t("plan.note")}
                    </Head>
                  </tr>
                  <tr>
                    <Head className="border-l text-right">{t("plan.opening.main")}</Head>
                    <Head className="text-right">{t("plan.opening.savings")}</Head>
                    {income.map((column, index) => (
                      <ColumnHead
                        key={column.categoryId}
                        column={column}
                        className={index === 0 ? "border-l" : undefined}
                      />
                    ))}
                    <TotalHead />
                    {expense.map((column, index) => (
                      <ColumnHead
                        key={column.categoryId}
                        column={column}
                        className={index === 0 ? "border-l" : undefined}
                      />
                    ))}
                    <TotalHead />
                    <Head className="border-l text-right">{t("plan.opening.main")}</Head>
                    <Head className="text-right">{t("plan.opening.savings")}</Head>
                  </tr>
                </thead>

                {/* Grouped by month, not by band. Three bands each listing every
                    month put a month's plan at the top of the table and its
                    difference two screens below — the one comparison the screen
                    exists to make was the one thing you could not see at once.
                    Now each month carries its own plan, fact and difference,
                    directly under each other. */}
                {months.map((month) => (
                  <tbody key={month.month} data-month={month.month}>
                    <tr>
                      <th
                        scope="rowgroup"
                        className="sticky left-0 z-20 whitespace-nowrap border-y bg-muted px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide"
                      >
                        <span className="flex items-center gap-1.5">
                          {monthLabel(month.month)}
                          <button
                            type="button"
                            aria-label={`${t("plan.removeMonth")}: ${monthLabel(month.month)}`}
                            title={t("plan.removeMonth")}
                            onClick={() => void removeMonth(month.month)}
                            className="text-muted-foreground/60 transition-colors hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      </th>
                      <td className="border-y bg-muted" colSpan={width - 1} />
                    </tr>
                    {(["plan", "fact", "diff"] as const).map((band) => (
                      <BandRow
                        key={`${band}-${month.month}`}
                        band={band}
                        month={month}
                        income={income}
                        expense={expense}
                        label={t(`plan.${band}`)}
                        monthLabel={monthLabel(month.month)}
                        money={money}
                        onSave={save}
                        onDrill={setDrill}
                      />
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What a fact figure is made of. Opened from the grid, closed back to it
          — the ledger itself is a screen away and rebuilding these filters by
          hand is where the answer used to get lost. */}
      <AmountDrilldown
        open={drill !== null}
        onOpenChange={(next) => {
          if (!next) setDrill(null);
        }}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        query={drill?.query ?? ""}
        excludeTransfers={!includeTransfers}
        currency={data.currency}
      />
    </div>
  );
}

/** What the grid hands the dialog when a fact figure is clicked. */
type DrilldownTarget = { title: string; subtitle?: string; query: string };

/**
 * "Добавить месяц" and the months to choose from. A year forward and a year and
 * a half back, minus the ones already in the grid: pressing the button used to
 * add whatever a date field beside it happened to hold.
 */
// Adding a month is choosing a month and a year, so the picker says so: the
// year on a stepper, its twelve months as a grid. The list it replaced could
// only offer the months around today — a plan for a year out meant scrolling a
// column of names, and the years were nowhere to be seen.
function AddMonthDialog({
  present,
  onPick
}: {
  present: Set<string>;
  onPick: (month: string) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Date(2020, index, 1).toLocaleDateString(locale === "en" ? "en" : "ru", { month: "short" })
  );
  const key = (index: number) => `${year}-${String(index + 1).padStart(2, "0")}`;
  const currentKey = monthKeyOf(today);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setYear(today.getFullYear());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          {t("plan.addMonth")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" data-testid="add-month-dialog">
        <DialogHeader>
          <DialogTitle>{t("plan.addMonth.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("plan.addMonth.prevYear")}
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="num text-base font-semibold">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("plan.addMonth.nextYear")}
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {monthNames.map((name, index) => {
            const month = key(index);
            const already = present.has(month);
            return (
              <button
                key={month}
                type="button"
                disabled={already}
                onClick={() => {
                  setOpen(false);
                  onPick(month);
                }}
                title={already ? t("plan.addMonth.already") : undefined}
                className={cn(
                  "rounded-md border px-2 py-2 text-sm capitalize transition-colors",
                  already
                    ? "cursor-not-allowed border-dashed text-muted-foreground/60"
                    : "hover:border-primary hover:bg-primary/10 hover:text-primary",
                  month === currentKey && !already && "border-primary/60 font-medium"
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Head({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      {...props}
      className={cn(
        "whitespace-nowrap border-b bg-card px-3 py-2 align-bottom text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </th>
  );
}

/**
 * The two sub-columns under a total: what went through cash and cards, and what
 * went through savings.
 *
 * "Итого" alone answered how much, never where it ended up — and the two pools
 * are the whole point of a month for someone who is trying to put money aside.
 */
function TotalHead() {
  const { t } = useI18n();
  return (
    <>
      {(["plan.opening.main", "plan.opening.savings"] as const).map((key, index) => (
        <Head key={key} className={cn("text-right font-semibold", index === 0 && "border-l")}>
          <span className="flex flex-col items-end leading-tight">
            <span>{t("plan.total")}</span>
            <span className="text-[10px] font-normal text-muted-foreground/80">{t(key)}</span>
          </span>
        </Head>
      ))}
    </>
  );
}

/**
 * One total, in the two sub-columns the header promises.
 *
 * Only the fact band can fill both. A plan is typed against a category and
 * carries no account, so there is no pool to put it in, and the difference
 * between a split figure and an unsplit one is not a split figure either.
 * Those two bands span the pair with the single number they honestly have,
 * rather than showing an invented half.
 */
function TotalCells({
  band,
  column,
  cell,
  split,
  money,
  tone,
  className,
  onDrill
}: {
  band: "plan" | "fact" | "diff";
  column: string;
  cell: PlanFactCell;
  split: PlanFactSplit;
  money: (value: number) => string;
  tone?: string;
  className?: string;
  /** Absent on the closing balance: it is a balance, not a sum of rows. */
  onDrill?: () => void;
}) {
  if (band !== "fact") {
    return (
      <Cell className={cn("font-semibold", className)} column={column} colSpan={2}>
        <Figure value={cell[band]} money={money} tone={tone} />
      </Cell>
    );
  }

  return (
    <>
      <Cell className={cn("font-semibold", className)} column={`${column}-main`}>
        {onDrill ? (
          <DrillFigure value={split.main} money={money} onOpen={onDrill} />
        ) : (
          <Figure value={split.main} money={money} />
        )}
      </Cell>
      <Cell className="font-semibold" column={`${column}-savings`}>
        {onDrill ? (
          <DrillFigure value={split.savings} money={money} onOpen={onDrill} />
        ) : (
          <Figure value={split.savings} money={money} />
        )}
      </Cell>
    </>
  );
}

/**
 * A fact figure that opens the operations behind it.
 *
 * A zero is left as plain text: there is nothing under it to show, and a button
 * that opens an empty list teaches the owner not to press the others.
 */
function DrillFigure({
  value,
  money,
  onOpen
}: {
  value: number;
  money: (value: number) => string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  if (value === 0) return <Figure value={value} money={money} />;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t("drill.open")}
      className="rounded underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Figure value={value} money={money} />
    </button>
  );
}

// A category column keeps its own colour and icon in the header — the same
// marks it carries everywhere else, so a column is recognised without reading.
function ColumnHead({ column, className }: { column: PlanFactColumn; className?: string }) {
  return (
    <Head
      className={cn("text-left", className)}
      style={{ boxShadow: `inset 0 -2px 0 ${column.color}` }}
    >
      <span className="flex items-center gap-1.5">
        <span
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: column.color }}
        >
          <CategoryIcon name={column.icon} className="size-2.5" />
        </span>
        {column.label}
      </span>
    </Head>
  );
}

// One band of one month. The plan band is made of fields; fact and difference
// are the same row read off the ledger.
function BandRow({
  band,
  month,
  income,
  expense,
  label,
  monthLabel,
  money,
  onSave,
  onDrill
}: {
  band: "plan" | "fact" | "diff";
  month: PlanFactMonth;
  income: PlanFactColumn[];
  expense: PlanFactColumn[];
  label: string;
  /** The month spelled out, for the dialog's own heading. */
  monthLabel: string;
  money: (value: number) => string;
  onSave: (body: Record<string, string>) => Promise<void>;
  onDrill: (target: DrilldownTarget) => void;
}) {
  const { t } = useI18n();
  const editable = band === "plan";
  const empty: PlanFactCell = { plan: 0, fact: 0, diff: 0 };
  const range = monthRange(month.month);

  /** The operations behind a fact figure, as the list page would filter them. */
  const drillTo = (title: string, categoryIds: string[]) =>
    onDrill({
      title,
      subtitle: monthLabel,
      query: new URLSearchParams({
        from: range.from,
        to: range.to,
        categoryId: categoryIds.join(",")
      }).toString()
    });

  const categoryCell = (column: PlanFactColumn, index: number) => {
    const figures = month.cells[column.categoryId] ?? empty;
    return (
      <Cell
        key={column.categoryId}
        column={column.label}
        className={index === 0 ? "border-l" : undefined}
      >
        {editable ? (
          <PlanCell
            value={figures.plan}
            money={money}
            onSave={(amount) =>
              onSave({ month: month.month, categoryId: column.categoryId, amount: String(amount) })
            }
          />
        ) : band === "fact" ? (
          <DrillFigure
            value={figures.fact}
            money={money}
            onOpen={() => drillTo(column.label, [column.categoryId])}
          />
        ) : (
          <Figure
            value={figures[band]}
            money={money}
            tone={band === "diff" ? diffTone(figures, column.kind === "INCOME") : undefined}
          />
        )}
      </Cell>
    );
  };

  return (
    <tr className="hover:bg-muted/30" data-band={band} data-month={month.month}>
      <th
        scope="row"
        className="sticky left-0 z-10 whitespace-nowrap border-b bg-card px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </th>
      <Cell className="border-l" column="opening">
        {editable ? (
          <PlanCell
            value={month.opening.plan}
            money={money}
            onSave={(amount) =>
              onSave({
                month: month.month,
                categoryId: OPENING_BALANCE_ID,
                amount: String(amount)
              })
            }
          />
        ) : (
          <Figure value={month.opening[band]} money={money} />
        )}
      </Cell>
      <Cell column="savings">
        {editable ? (
          <PlanCell
            value={month.savings.plan}
            money={money}
            onSave={(amount) =>
              onSave({
                month: month.month,
                categoryId: SAVINGS_BALANCE_ID,
                amount: String(amount)
              })
            }
          />
        ) : (
          <Figure value={month.savings[band]} money={money} />
        )}
      </Cell>

      {income.map(categoryCell)}
      <TotalCells
        band={band}
        column="income-total"
        cell={month.income}
        split={month.incomeBy}
        money={money}
        tone={band === "diff" ? diffTone(month.income, true) : undefined}
        onDrill={() =>
          drillTo(
            t("plan.income"),
            income.map((column) => column.categoryId)
          )
        }
      />

      {expense.map(categoryCell)}
      <TotalCells
        band={band}
        column="expense-total"
        cell={month.expense}
        split={month.expenseBy}
        money={money}
        tone={band === "diff" ? diffTone(month.expense, false) : undefined}
        onDrill={() =>
          drillTo(
            t("plan.expense"),
            expense.map((column) => column.categoryId)
          )
        }
      />

      <TotalCells
        band={band}
        column="result"
        cell={month.result}
        split={month.resultBy}
        money={money}
        className="border-l"
        tone={band === "diff" ? diffTone(month.result, true) : undefined}
      />

      <td className="border-b border-l px-3 py-1.5">
        {band === "diff" ? null : (
          <NoteField
            key={`${band}-${month.month}`}
            initial={band === "plan" ? month.note : month.factNote}
            placeholder={t("plan.note.placeholder")}
            onSave={(note) =>
              onSave({ month: month.month, [band === "plan" ? "note" : "factNote"]: note })
            }
          />
        )}
      </td>
    </tr>
  );
}

function Cell({
  children,
  className,
  column,
  colSpan
}: {
  children: ReactNode;
  className?: string;
  column?: string;
  colSpan?: number;
}) {
  return (
    <td
      data-column={column}
      colSpan={colSpan}
      className={cn("num whitespace-nowrap border-b px-3 py-1.5 text-right", className)}
    >
      {children}
    </td>
  );
}

// Zeros are kept rather than blanked — in a table this wide an empty cell reads
// as a hole — but they step back so the money stands out.
function Figure({
  value,
  money,
  tone
}: {
  value: number;
  money: (value: number) => string;
  tone?: string;
}) {
  return (
    <span className={cn(value === 0 ? "text-muted-foreground/50" : tone)}>{money(value)}</span>
  );
}

// A gap only means something when there was a plan to miss; without one the
// figure is just "everything you spent", and colouring it red would be a
// verdict on a decision never made. Earning less than planned is the bad
// direction, so income reads the opposite way to spending.
function diffTone(cell: PlanFactCell, goodWhenNegative: boolean): string {
  if (cell.plan === 0 || cell.diff === 0) return "text-muted-foreground";
  const good = goodWhenNegative ? cell.diff < 0 : cell.diff > 0;
  return good ? "text-success" : "text-destructive";
}

// A plan cell is a plain number until it is clicked, and a money field with a
// calculator once it is. Keeping hundreds of live fields on screen would cost
// what a grid this wide cannot afford on a phone; one at a time is all the
// typing anyone does anyway.
function PlanCell({
  value,
  money,
  onSave
}: {
  value: number;
  money: (value: number) => string;
  onSave: (amount: number) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  // The calculator lives in a dialog, so opening it takes focus out of the
  // field. Without this the cell would close under its own calculator.
  const [calculating, setCalculating] = useState(false);
  // Applying a calculator result changes the draft and closes the dialog in one
  // handler, so the close callback still sees the value from before the sum —
  // and committed that, throwing the result away. The ref always holds what the
  // field holds now.
  const latest = useRef<string | null>(null);

  function edit(next: string) {
    latest.current = next;
    setDraft(next);
  }

  function commit(next: string | null) {
    setDraft(null);
    setCalculating(false);
    latest.current = null;
    if (next === null) return;
    const amount = Number(next.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount === value) return;
    onSave(amount);
  }

  if (draft === null)
    return (
      <button
        type="button"
        onClick={() => edit(value ? String(value) : "")}
        aria-label={t("plan.plan")}
        className={cn(
          "num w-full rounded px-1 py-0.5 text-right underline decoration-dotted decoration-1 underline-offset-4 hover:bg-accent/10",
          value === 0 && "text-muted-foreground/50"
        )}
      >
        {money(value)}
      </button>
    );

  return (
    // The wrapper, not the input, watches focus: the calculator button sits
    // inside it, and tabbing to that button must not count as leaving the cell.
    <div
      className="ml-auto w-36"
      onBlur={(event) => {
        if (calculating) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        commit(latest.current);
      }}
    >
      <AmountInput
        autoFocus
        value={draft}
        onValueChange={edit}
        onCalculatorOpenChange={(open) => {
          setCalculating(open);
          // Closing means the result has been applied (or dismissed); either
          // way the cell is done being edited.
          if (!open) setTimeout(() => commit(latest.current), 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") commit(null);
        }}
        className="h-8 text-right"
        placeholder="0"
        inputMode="decimal"
      />
    </div>
  );
}

function NoteField({
  initial,
  placeholder,
  onSave
}: {
  initial: string;
  placeholder: string;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(initial);

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== initial) onSave(draft);
      }}
      placeholder={placeholder}
      maxLength={500}
      className="h-8 w-56 px-2"
    />
  );
}
