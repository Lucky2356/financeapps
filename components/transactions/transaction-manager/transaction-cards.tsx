"use client";

import { Paperclip, Trash2 } from "lucide-react";

import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { DayGroup } from "@/lib/transactions/day-groups";
import { cn } from "@/lib/utils";

import { DayHeader } from "@/components/transactions/transaction-manager/day-header";
import {
  isJustAdded,
  type TransactionRow
} from "@/components/transactions/transaction-manager/helpers";

type CardProps = {
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  rowAmount: (transaction: TransactionRow) => string;
  isMutating: boolean;
  onPhoto: (id: string) => void;
  onEdit: (transaction: TransactionRow) => void;
  onRemove: (transaction: TransactionRow) => Promise<void>;
};

/** Список операций карточками — на телефоне, с заголовками дней. */
export function TransactionCards({
  transactions,
  dayStarts,
  ...card
}: CardProps & {
  transactions: TransactionRow[];
  dayStarts: Map<string, DayGroup<TransactionRow>>;
}) {
  // Заголовки дней есть только при порядке по дате (см. use-list-view.ts).
  // Тогда каждый день — своя обёртка: заголовок прилипает под шапкой, пока
  // листаешь именно этот день, и уходит вместе с его последней карточкой.
  if (dayStarts.size === 0) {
    return (
      <div className="space-y-2 md:hidden">
        {transactions.map((transaction) => (
          <TransactionCard key={transaction.id} transaction={transaction} showDate {...card} />
        ))}
      </div>
    );
  }

  const days: Array<{ group: DayGroup<TransactionRow> | undefined; rows: TransactionRow[] }> = [];
  for (const transaction of transactions) {
    const group = dayStarts.get(transaction.id);
    const current = days[days.length - 1];
    if (group || !current) days.push({ group, rows: [transaction] });
    else current.rows.push(transaction);
  }

  return (
    <div className="space-y-3 md:hidden">
      {days.map(({ group, rows }) => (
        <section key={rows[0].id} data-testid="day-group" className="space-y-2">
          {group ? <DayHeader group={group} /> : null}
          {rows.map((transaction) => (
            // Дата уже в заголовке дня — в карточке её не повторяем.
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              showDate={false}
              {...card}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Одна операция. Компактная, чтобы на экран телефона влезало больше строк:
 * «скрепка» и «корзина» стояли столбиком под суммой, и корзина занимала целый
 * пустой ряд внизу карточки. Теперь обе — в одном ряду под суммой, рядом с
 * описанием. Зоны нажатия — по 40 px, как и у галочки: она занимает всю левую
 * полосу карточки.
 */
function TransactionCard({
  transaction,
  showDate,
  selectedIds,
  onToggleSelect,
  rowAmount,
  isMutating,
  onPhoto,
  onEdit,
  onRemove
}: CardProps & { transaction: TransactionRow; showDate: boolean }) {
  const { t } = useI18n();

  return (
    <div
      data-testid="tx-card"
      className={cn(
        "flex items-stretch gap-1 rounded-lg border py-1.5 pr-1",
        isJustAdded(transaction) && "flash-new"
      )}
    >
      <label className="flex w-10 shrink-0 cursor-pointer justify-center pt-1.5">
        <input
          type="checkbox"
          className="size-4 accent-[hsl(var(--primary))]"
          checked={selectedIds.has(transaction.id)}
          onChange={() => onToggleSelect(transaction.id)}
          aria-label={t("tx.bulk.selectRow")}
        />
      </label>
      {/* The body of the row opens the editor — correcting an amount is the
          most common thing done here, and hunting for a pencil on a phone is a
          poor way to start it. */}
      <button
        type="button"
        onClick={() => onEdit(transaction)}
        aria-label={t("common.edit")}
        className="min-w-0 flex-1 py-0.5 text-left"
      >
        <p className="truncate text-sm font-semibold">{transaction.category.label}</p>
        {/* Обрезается название счёта, а не дата: одной строкой на телефоне
            пропадало и то и другое сразу — «05 сент. 2026 · Дебетовая ка…».
            Дата короткая и всегда одной длины, ей место есть. */}
        <p className="flex min-w-0 gap-1 text-xs text-muted-foreground">
          {showDate ? (
            <>
              <span className="shrink-0">{formatDate(transaction.date)}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span className="truncate">{transaction.account.label}</span>
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {transaction.description ?? t("tx.noDescription")}
        </p>
        {(transaction.tags?.length || transaction.splitGroupId) && (
          <span className="mt-1 flex flex-wrap gap-1">
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
      <div className="flex shrink-0 flex-col items-end justify-between">
        <p
          className={cn(
            "num px-2 pt-0.5 text-right font-semibold",
            transaction.type === "INCOME" && "text-success"
          )}
        >
          {transaction.type === "INCOME" ? "+" : "-"}
          {rowAmount(transaction)}
        </p>
        <div className="flex">
          <button
            type="button"
            aria-label={transaction.photo ? t("photo.has") : t("photo.attach")}
            data-testid="tx-photo-mobile"
            onClick={() => onPhoto(transaction.id)}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-md",
              transaction.photo ? "text-primary" : "text-muted-foreground/60"
            )}
          >
            <Paperclip className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("common.delete")}
            disabled={isMutating}
            onClick={() => void onRemove(transaction)}
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
