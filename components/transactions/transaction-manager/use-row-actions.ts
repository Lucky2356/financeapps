"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { normalizeSelectValues } from "@/components/ui/select";
import type { useConfirm } from "@/components/ui/confirm-dialog";
import type { useApiMutation } from "@/hooks/use-api-mutation";
import type { useConfirmFutureDate } from "@/hooks/use-confirm-future-date";
import { apiClient } from "@/lib/api/client";
import type { DeletePath } from "@/lib/api/routes";
import type { TransactionsPageData } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import type { useI18n } from "@/lib/i18n/context";
import { isTransfer } from "@/lib/transactions/transfers";

import type {
  BudgetWarning,
  TransactionRow
} from "@/components/transactions/transaction-manager/helpers";

/** Правка и удаление одной операции — то, что делается из строки списка. */
export function useTransactionRowActions({
  pageData,
  run,
  confirm,
  confirmFutureDate,
  t,
  rowAmount,
  refresh
}: {
  pageData: TransactionsPageData;
  run: ReturnType<typeof useApiMutation>["run"];
  confirm: ReturnType<typeof useConfirm>;
  confirmFutureDate: ReturnType<typeof useConfirmFutureDate>;
  t: ReturnType<typeof useI18n>["t"];
  rowAmount: (transaction: TransactionRow) => string;
  refresh: () => Promise<void>;
}) {
  const [editingTransaction, setEditingTransaction] = useState<
    TransactionsPageData["transactions"][number] | null
  >(null);

  // Editing only. Adding one goes through the quick-add dialog the round button
  // opens — this screen no longer carries a second door to the same room.
  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = normalizeSelectValues(
      Object.fromEntries(new FormData(event.currentTarget).entries())
    );

    // Editing the date into the future counts the money out of the balance the
    // same way adding it does, so the same question is asked here.
    if (!(await confirmFutureDate(payload.date))) return;

    await run(() => apiClient.put<{ budgetWarning?: BudgetWarning }>("/transactions", payload), {
      success: t("tx.toast.updated"),
      error: t("tx.toast.saveError"),
      onSuccess: async (result) => {
        setEditingTransaction(null);
        if (result?.budgetWarning) {
          toast.warning(
            t("tx.toast.budgetWarning", {
              category: result.budgetWarning.category,
              spent: formatCurrency(result.budgetWarning.spent),
              limit: formatCurrency(result.budgetWarning.limit)
            })
          );
        }
        await refresh();
      }
    });
  }

  // Deleting one operation asks first, exactly as deleting several already did.
  // A mis-tap next to the edit pencil used to wipe a record with no way back —
  // the dialog names the operation so it is clear WHICH one is about to go.
  async function removeTransaction(transaction: TransactionsPageData["transactions"][number]) {
    // Часть разделённой покупки удаляется вместе с остальными частями: одна
    // половина чека без другой — это уже неправда о покупке.
    const group = transaction.splitGroupId;
    const parts = group
      ? pageData.transactions.filter((tx) => tx.splitGroupId === group).length
      : 1;
    const ok = await confirm({
      title: t("tx.delete.title"),
      description:
        group && parts > 1
          ? t("tx.delete.split", { count: parts, date: formatDate(transaction.date) })
          : t("tx.delete.desc", {
              category: transaction.category.label,
              amount: rowAmount(transaction),
              date: formatDate(transaction.date)
            }),
      destructive: true,
      confirmLabel: t("common.delete")
    });
    if (!ok) return;
    // Подтвердили — и всё равно можно передумать: обычная операция удаляется с
    // кнопкой «Отменить» в уведомлении. Переводы и части разделённой покупки
    // затрагивают несколько строк — их возвращать по одной нельзя.
    if (
      !group &&
      !transaction.transferId &&
      !isTransfer({ description: transaction.description ?? null, transferId: undefined })
    ) {
      await deleteWithUndo(transaction);
      return;
    }
    const path: DeletePath = group
      ? `/transactions?splitGroupId=${encodeURIComponent(group)}`
      : `/transactions?id=${encodeURIComponent(transaction.id)}`;
    await run(() => apiClient.delete(path), {
      success: t("tx.toast.deleted"),
      error: t("tx.toast.deleteError"),
      onSuccess: refresh
    });
  }

  async function deleteWithUndo(transaction: TransactionsPageData["transactions"][number]) {
    // Фото удаляется вместе с операцией, поэтому читается заранее: чтобы «Отменить»
    // вернуло и его.
    let photo: { data: string; place: "synced" | "device" } | null = null;
    if (transaction.photo) {
      const answer = await apiClient
        .get(`/photos?id=${encodeURIComponent(transaction.id)}`)
        .catch(() => null);
      if (answer?.photo && answer.place) photo = { data: answer.photo, place: answer.place };
    }
    await run(() => apiClient.delete(`/transactions?id=${encodeURIComponent(transaction.id)}`), {
      error: t("tx.toast.deleteError"),
      onSuccess: async () => {
        await refresh();
        toast(t("tx.toast.deleted"), {
          duration: 8000,
          action: { label: t("fav.undo"), onClick: () => void undoDelete(transaction, photo) }
        });
      }
    });
  }

  async function undoDelete(
    transaction: TransactionsPageData["transactions"][number],
    photo: { data: string; place: "synced" | "device" } | null
  ) {
    try {
      await apiClient.post("/transactions", { action: "restore", transaction });
      if (photo) {
        await apiClient
          .post("/photos", {
            transactionId: transaction.id,
            data: photo.data,
            width: 0,
            height: 0,
            place: photo.place
          })
          .catch(() => undefined);
      }
      toast.success(t("tx.toast.restored"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    }
    await refresh();
  }

  return { editingTransaction, setEditingTransaction, submitTransaction, removeTransaction };
}
