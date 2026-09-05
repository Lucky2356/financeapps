"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { TransactionsPageData } from "@/lib/data";
import type { TransactionRow } from "@/types/finance";

/**
 * The operations behind one number.
 *
 * Every total on this app is a sum of rows in the ledger, and until now the
 * only way to see which rows was to leave the screen, rebuild the same filters
 * by hand on the operations page, and hope they matched. They rarely did — the
 * period alone is easy to get wrong by a day — so a figure that looked wrong
 * could not be checked, only distrusted.
 *
 * The list is fetched with the same filters the figure was built from and is
 * read-only: this answers "what is this made of", not "let me fix it". The rows
 * arrive on one page (`limit=all`); a month of one category is tens of rows,
 * and a second page here would hide exactly the row being looked for.
 */
export function AmountDrilldown({
  open,
  onOpenChange,
  title,
  subtitle,
  /** Query string for `/transactions`, without `limit`. */
  query,
  /**
   * Drop both halves of a transfer, matching a total that was built without
   * them. The operations endpoint can select transfers but not exclude them,
   * and a listed row the figure above does not count is worse than no list.
   */
  excludeTransfers = false,
  currency
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  subtitle?: string;
  query: string;
  excludeTransfers?: boolean;
  currency: string;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await apiClient.get<TransactionsPageData>(
          `/transactions?${query}${query ? "&" : ""}limit=all`
        );
        if (cancelled) return;
        setFailed(false);
        setRows(
          excludeTransfers ? data.transactions.filter((row) => !row.transferId) : data.transactions
        );
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      // The next figure clicked must not show the previous one's rows while it
      // loads: a list that looks settled but belongs to another cell is worse
      // than a moment of "загружаем".
      setRows(null);
    };
  }, [open, query, excludeTransfers]);

  const total = (rows ?? []).reduce((sum, row) => sum + row.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto" data-testid="drilldown">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}

        {failed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("drill.failed")}</p>
        ) : rows === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("drill.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("drill.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">{t("drill.date")}</th>
                    <th className="py-2 pr-3 text-left font-medium">{t("drill.account")}</th>
                    <th className="py-2 pr-3 text-left font-medium">{t("drill.description")}</th>
                    <th className="py-2 text-right font-medium">{t("drill.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="num whitespace-nowrap py-1.5 pr-3">{formatDate(row.date)}</td>
                      <td className="py-1.5 pr-3">{row.account.label}</td>
                      {/* An operation without a description is the common case —
                          the category is what it was filed under, so that is
                          what stands in for a name here. */}
                      <td className="py-1.5 pr-3">{row.description || row.category.label}</td>
                      <td className="num whitespace-nowrap py-1.5 text-right font-medium">
                        {formatCurrency(row.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The sum of what is listed, so it can be held against the figure
                that was clicked. A mismatch means the filters behind the two
                differ, and that is worth seeing rather than hiding. */}
            <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
              <span>{t("drill.total", { n: rows.length })}</span>
              <span className="num" data-testid="drill-total">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
