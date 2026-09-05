"use client";

import { useCallback } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/format";
import { isFutureDay } from "@/lib/transactions/date";
import { useI18n } from "@/lib/i18n/context";

/**
 * The question asked before an operation is saved with a date ahead of today.
 *
 * Such an operation leaves the account balance and the net worth at once, as if
 * the money were already spent. Post-dating on purpose is a real thing, so this
 * asks rather than refuses — but it does ask: the year is one keystroke wide,
 * and the figure it moves is the one on the home screen.
 *
 * Adding an operation and editing one are two screens; the question is one, and
 * so is its wording. A date that is not in the future passes through silently,
 * which is what lets the call sites read as a single guard line.
 */
export function useConfirmFutureDate(): (day: unknown) => Promise<boolean> {
  const confirm = useConfirm();
  const { t } = useI18n();

  return useCallback(
    async (day: unknown) => {
      const value = String(day ?? "");
      if (!value || !isFutureDay(value)) return true;
      return confirm({
        title: t("tx.future.confirm.title"),
        description: t("tx.future.confirm.desc", { date: formatDate(value) }),
        confirmLabel: t("tx.future.confirm.ok")
      });
    },
    [confirm, t]
  );
}
