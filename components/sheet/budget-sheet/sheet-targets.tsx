"use client";

import { X } from "lucide-react";

import { monthLabel, useSheetText } from "@/components/sheet/sheet-text";
import type { SheetPageData } from "@/lib/api/local/sheet";
import type { ComputedRow } from "@/lib/sheet/model";

export function SheetTargets({
  rows,
  targets,
  money,
  onRemove
}: {
  rows: ComputedRow[];
  targets: SheetPageData["targets"];
  money: (value: number) => string;
  onRemove: (id: string) => void;
}) {
  const { words, format, locale } = useSheetText();
  if (targets.length === 0 || rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="sheet-targets">
      {targets.map((target) => {
        const month = target.date.slice(0, 7);
        const reached = [...rows].reverse().find((row) => row.month <= month) ?? null;
        const last = rows[rows.length - 1];
        const progress = reached
          ? Math.max(0, Math.min(1, reached.savingsTotal / target.amount))
          : 0;
        let line: string;
        if (reached && reached.month === month) {
          line =
            reached.savingsTotal >= target.amount
              ? format(words.targetReached, { amount: money(reached.savingsTotal) })
              : format(words.targetOnTrack, {
                  month: monthLabel(reached.month, locale),
                  amount: money(reached.savingsTotal),
                  perMonth: money(target.amount - reached.savingsTotal)
                });
        } else if (last.month < month) {
          const [ly, lm] = last.month.split("-").map(Number);
          const [ty, tm] = month.split("-").map(Number);
          const left = Math.max(1, (ty - ly) * 12 + (tm - lm));
          line = format(words.targetOnTrack, {
            month: monthLabel(last.month, locale),
            amount: money(last.savingsTotal),
            perMonth: money(Math.max(0, (target.amount - last.savingsTotal) / left))
          });
        } else {
          line = words.targetNoRows;
        }
        const date = new Date(`${target.date}T12:00:00`).toLocaleDateString(
          locale === "en" ? "en-GB" : "ru-RU"
        );
        return (
          <div
            key={target.id}
            className="min-w-[16rem] flex-1 rounded-lg border bg-card p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {format(words.targetBy, {
                  label: target.label,
                  date,
                  amount: money(target.amount)
                })}
              </p>
              <button
                type="button"
                aria-label={words.delete}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => onRemove(target.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-success" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{line}</p>
          </div>
        );
      })}
    </div>
  );
}
