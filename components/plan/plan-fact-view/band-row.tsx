"use client";

import {
  monthRange,
  type Band,
  type DrilldownTarget
} from "@/components/plan/plan-fact-view/helpers";
import {
  Cell,
  DrillFigure,
  Figure,
  NoteField,
  PlanCell,
  ResultCells,
  TotalCells,
  diffTone
} from "@/components/plan/plan-fact-view/table-cells";
import {
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID
} from "@/lib/api/LocalApiClient";
import { useI18n } from "@/lib/i18n/context";
import type { PlanFactCell, PlanFactColumn, PlanFactMonth } from "@/types/finance";

// One band of one month. The plan band is made of fields; fact and difference
// are the same row read off the ledger.
export function BandRow({
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
  band: Band;
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
  const drillTo = (title: string, categoryIds: string[], pool?: "main" | "savings") =>
    onDrill({
      title: pool
        ? `${title} · ${t(pool === "main" ? "plan.opening.main" : "plan.opening.savings")}`
        : title,
      subtitle: monthLabel,
      query: new URLSearchParams({
        from: range.from,
        to: range.to,
        categoryId: categoryIds.join(",")
      }).toString(),
      pool
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
        pools={month.incomePools}
        money={money}
        goodWhenNegative={true}
        onDrill={(pool) =>
          drillTo(
            t("plan.income"),
            income.map((column) => column.categoryId),
            pool
          )
        }
      />

      {expense.map(categoryCell)}
      <TotalCells
        band={band}
        column="expense-total"
        pools={month.expensePools}
        money={money}
        goodWhenNegative={false}
        onDrill={(pool) =>
          drillTo(
            t("plan.expense"),
            expense.map((column) => column.categoryId),
            pool
          )
        }
      />

      {/* Перевод в сбережения: не доход и не расход, а переезд своих же денег
          между своими же счетами. Потому и стоит отдельным столбцом, между
          расходами и итогом, а не среди статей. */}
      <Cell column="to-savings" className="border-l">
        {editable ? (
          <PlanCell
            value={month.toSavings.plan}
            money={money}
            onSave={(amount) =>
              onSave({
                month: month.month,
                categoryId: SAVINGS_TRANSFER_ID,
                amount: String(amount)
              })
            }
          />
        ) : (
          <Figure
            value={month.toSavings[band]}
            money={money}
            tone={band === "diff" ? diffTone(month.toSavings, true) : undefined}
          />
        )}
      </Cell>

      <ResultCells band={band} cells={month.resultBy} money={money} className="border-l" />

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
