"use client";

import { Edit2, Paperclip, Trash2 } from "lucide-react";

import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

import {
  isJustAdded,
  type TransactionRow
} from "@/components/transactions/transaction-manager/helpers";

/** Список операций таблицей — на широком экране (md и шире). */
export function TransactionTable({
  transactions,
  selectedIds,
  allVisibleSelected,
  onToggleSelectAll,
  onToggleSelect,
  rowAmount,
  isMutating,
  onPhoto,
  onEdit,
  onRemove
}: {
  transactions: TransactionRow[];
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  rowAmount: (transaction: TransactionRow) => string;
  isMutating: boolean;
  onPhoto: (id: string) => void;
  onEdit: (transaction: TransactionRow) => void;
  onRemove: (transaction: TransactionRow) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                className="size-4 accent-[hsl(var(--primary))]"
                checked={allVisibleSelected}
                onChange={onToggleSelectAll}
                aria-label={t("tx.bulk.selectAll")}
              />
            </TableHead>
            <TableHead>{t("common.date")}</TableHead>
            <TableHead>{t("common.category")}</TableHead>
            <TableHead>{t("tx.account")}</TableHead>
            <TableHead>{t("tx.col.description")}</TableHead>
            <TableHead className="text-right">{t("common.amount")}</TableHead>
            <TableHead className="w-[6.5rem] text-right">{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id} className={cn(isJustAdded(transaction) && "flash-new")}>
              <TableCell>
                <input
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selectedIds.has(transaction.id)}
                  onChange={() => onToggleSelect(transaction.id)}
                  aria-label={t("tx.bulk.selectRow")}
                />
              </TableCell>
              <TableCell>{formatDate(transaction.date)}</TableCell>
              {/* Long names are cut rather than allowed to push the
                  actions column out of the card: between a phone and
                  a wide window the table had more columns than room. */}
              <TableCell>
                <span className="flex max-w-[11rem] items-center gap-2">
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: transaction.category.color }}
                  >
                    <CategoryIcon name={transaction.category.icon} className="size-3" />
                  </span>
                  <span className="truncate">{transaction.category.label}</span>
                </span>
              </TableCell>
              <TableCell>
                <span className="block max-w-[9rem] truncate">{transaction.account.label}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span className="block max-w-[12rem] truncate">
                  {transaction.description ?? "—"}
                </span>
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
              </TableCell>
              <TableCell
                className={
                  transaction.type === "INCOME"
                    ? "text-right font-semibold text-success"
                    : "text-right font-semibold"
                }
              >
                {transaction.type === "INCOME" ? "+" : "-"}
                {rowAmount(transaction)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title={transaction.photo ? t("photo.has") : t("photo.attach")}
                    aria-label={transaction.photo ? t("photo.has") : t("photo.attach")}
                    data-testid="tx-photo"
                    onClick={() => onPhoto(transaction.id)}
                  >
                    <Paperclip
                      className={transaction.photo ? "size-4 text-primary" : "size-4 opacity-40"}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title={t("common.editAria")}
                    aria-label={t("tx.editAria")}
                    onClick={() => onEdit(transaction)}
                  >
                    <Edit2 className="size-4" />
                  </Button>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onRemove(transaction);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title={t("common.delete")}
                      aria-label={t("tx.deleteAria")}
                      disabled={isMutating}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
