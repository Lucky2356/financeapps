"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { Fragment } from "react";

import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { DayGroup } from "@/lib/transactions/day-groups";
import { cn } from "@/lib/utils";

import { DayHeader } from "@/components/transactions/transaction-manager/day-header";
import {
  isJustAdded,
  type TransactionRow
} from "@/components/transactions/transaction-manager/helpers";

/** Список операций карточками — на телефоне, с заголовками дней. */
export function TransactionCards({
  transactions,
  dayStarts,
  selectedIds,
  onToggleSelect,
  rowAmount,
  isMutating,
  onPhoto,
  onEdit,
  onRemove
}: {
  transactions: TransactionRow[];
  dayStarts: Map<string, DayGroup<TransactionRow>>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  rowAmount: (transaction: TransactionRow) => string;
  isMutating: boolean;
  onPhoto: (id: string) => void;
  onEdit: (transaction: TransactionRow) => void;
  onRemove: (transaction: TransactionRow) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-2 md:hidden">
      {transactions.map((transaction) => (
        <Fragment key={transaction.id}>
          {dayStarts.has(transaction.id) ? (
            <DayHeader group={dayStarts.get(transaction.id)!} />
          ) : null}
          <div className={cn("rounded-lg border p-3", isJustAdded(transaction) && "flash-new")}>
            <div className="flex items-start justify-between gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]"
                checked={selectedIds.has(transaction.id)}
                onChange={() => onToggleSelect(transaction.id)}
                aria-label={t("tx.bulk.selectRow")}
              />
              {/* The body of the row opens the editor — correcting an
                amount is the most common thing done here, and hunting
                for a pencil on a phone is a poor way to start it. */}
              <button
                type="button"
                onClick={() => onEdit(transaction)}
                aria-label={t("common.edit")}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-sm font-semibold">{transaction.category.label}</p>
                {/* Обрезается название счёта, а не дата: одной строкой
                  на телефоне пропадало и то и другое сразу —
                  «05 сент. 2026 · Дебетовая ка…». Дата короткая и
                  всегда одной длины, ей место есть. */}
                <p className="mt-0.5 flex min-w-0 gap-1 text-xs text-muted-foreground">
                  <span className="shrink-0">{formatDate(transaction.date)}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{transaction.account.label}</span>
                </p>
                <p className="mt-1 truncate text-[13px] text-muted-foreground">
                  {transaction.description ?? t("tx.noDescription")}
                </p>
                {(transaction.tags?.length || transaction.splitGroupId) && (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {transaction.splitGroupId ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        {t("tx.split.badge")}
                      </span>
                    ) : null}
                    {transaction.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                      >
                        #{tag}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p
                  className={
                    transaction.type === "INCOME" ? "font-semibold text-success" : "font-semibold"
                  }
                >
                  {transaction.type === "INCOME" ? "+" : "-"}
                  {rowAmount(transaction)}
                </p>
                <button
                  type="button"
                  aria-label={transaction.photo ? t("photo.has") : t("photo.attach")}
                  data-testid="tx-photo-mobile"
                  onClick={() => onPhoto(transaction.id)}
                  className={
                    transaction.photo
                      ? "tap-target inline-flex items-center justify-center rounded p-1 text-primary"
                      : "tap-target inline-flex items-center justify-center rounded p-1 text-muted-foreground/60"
                  }
                >
                  <Paperclip className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  disabled={isMutating}
                  onClick={() => void onRemove(transaction)}
                  className="tap-target inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
