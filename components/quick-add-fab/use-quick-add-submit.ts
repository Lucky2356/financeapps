"use client";

import type { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";

import type { useConfirmFutureDate } from "@/hooks/use-confirm-future-date";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import type { useI18n } from "@/lib/i18n/context";
import { LAST_ACCOUNT_KEY, writeMine } from "@/lib/storage/mine";

import { splitRemainder, toNumber } from "@/components/quick-add-fab/helpers";
import type { QuickAddForm } from "@/components/quick-add-fab/use-quick-add-form";

/** Запись: одна операция, покупка по нескольким категориям или перевод. */
export function useQuickAddSubmit({
  form,
  confirmFutureDate,
  t,
  markRecorded,
  router
}: {
  form: QuickAddForm;
  confirmFutureDate: ReturnType<typeof useConfirmFutureDate>;
  t: ReturnType<typeof useI18n>["t"];
  markRecorded: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const {
    type,
    accountId,
    toAccountId,
    categoryId,
    amount,
    splitParts,
    cleanedDescription,
    fromReceipt,
    setPhotoFor,
    setOpen
  } = form;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    // В журнал уходит описание без того, что разбор уже разложил по полям:
    // «1200 продукты картой» сохраняется как «продукты». В поле осталось
    // набранное целиком — намеренно, и под полем написано, что сохранится.
    if (cleanedDescription !== null) payload.description = cleanedDescription;

    if (!(await confirmFutureDate(payload.date))) return;
    if (type === "TRANSFER") return submitTransfer(payload);
    if (!accountId) return toast.error(t("qa.err.account"));
    if (!categoryId) return toast.error(t("qa.err.category"));

    if (splitParts.length > 0) return submitSplit(payload);

    try {
      const result = await apiClient.post("/transactions", {
        ...payload,
        type,
        accountId,
        categoryId
      });
      try {
        writeMine(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
      const savedId = result?.id;
      if (fromReceipt && savedId) {
        toast.success(t("tx.toast.added"), {
          description: t("photo.offer"),
          duration: 10_000,
          action: { label: t("photo.offerAction"), onClick: () => setPhotoFor(savedId) }
        });
      } else {
        toast.success(t("tx.toast.added"));
      }
      if (result?.budgetWarning) {
        toast.warning(
          t("tx.toast.budgetWarning", {
            category: result.budgetWarning.category,
            spent: formatCurrency(result.budgetWarning.spent),
            limit: formatCurrency(result.budgetWarning.limit)
          })
        );
      }
      // Сторож: втрое больше обычного — не лишний ли ноль?
      if (result?.unusual) {
        toast.warning(
          t("watch.unusualNow", {
            amount: formatCurrency(toNumber(amount)),
            usual: formatCurrency(result.unusual.usual)
          }),
          { duration: 10_000 }
        );
      }
      markRecorded();
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    }
  }

  // Покупка по нескольким категориям: основная получает остаток.
  async function submitSplit(payload: Record<string, FormDataEntryValue>) {
    const extras = splitParts.filter((part) => part.categoryId && toNumber(part.amount) > 0);
    const rest = splitRemainder(amount, splitParts);
    if (extras.length !== splitParts.length) return toast.error(t("qa.split.errPart"));
    if (!(rest > 0)) return toast.error(t("qa.split.errRest"));
    try {
      await apiClient.post("/transactions", {
        ...payload,
        action: "split",
        type,
        accountId,
        parts: JSON.stringify([
          { categoryId, amount: String(rest) },
          ...extras.map((part) => ({ categoryId: part.categoryId, amount: part.amount }))
        ])
      });
      try {
        writeMine(LAST_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
      toast.success(t("qa.split.added", { count: extras.length + 1 }));
      markRecorded();
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.saveError"));
    }
  }

  // Same endpoint and payload the operations screen uses for a transfer, so
  // both entry points create exactly the same pair of records.
  async function submitTransfer(payload: Record<string, FormDataEntryValue>) {
    if (!accountId || !toAccountId) return toast.error(t("qa.err.account"));
    if (accountId === toAccountId) return toast.error(t("qa.err.sameAccount"));

    try {
      await apiClient.post("/transactions", {
        action: "transfer",
        amount: payload.amount,
        date: payload.date,
        description: payload.description,
        fromAccountId: accountId,
        toAccountId
      });
      toast.success(t("tx.toast.transferCreated"));
      markRecorded();
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tx.toast.transferError"));
    }
  }

  return { handleSubmit };
}
