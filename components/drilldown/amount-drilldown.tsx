"use client";

import { useEffect, useState } from "react";

import { ResponsiveTable, type ResponsiveColumn } from "@/components/ui/responsive-table";
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

  // Three states with nothing to draw a table for, and the one line that says
  // which. Named rather than nested into a chain of ternaries: the order of the
  // checks matters — a failed request has no rows either, and reading "empty"
  // when the request fell over would send the owner looking for a bug in their
  // own figures.
  let nothingToShow: string | null = null;
  if (failed) nothingToShow = t("drill.failed");
  else if (rows === null) nothingToShow = t("drill.loading");
  else if (rows.length === 0) nothingToShow = t("drill.empty");

  // The four columns described once rather than spelled out twice, in the
  // header and again in the body. An operation without a description is the
  // common case — the category is what it was filed under, so that stands in
  // for a name.
  //
  // Через общий вид: на телефоне это карточки, а не таблица. Прежде таблица
  // прокручивалась вбок внутри диалога, который прокручивается вниз, — сумма,
  // ради которой расшифровку и открывают, начиналась за правым краем.
  const columns: Array<ResponsiveColumn<TransactionRow>> = [
    {
      header: t("drill.date"),
      cell: (row) => <span className="num whitespace-nowrap">{formatDate(row.date)}</span>
    },
    { header: t("drill.account"), cell: (row) => row.account.label },
    {
      header: t("drill.description"),
      primary: true,
      cell: (row) => row.description || row.category.label
    },
    {
      header: t("drill.amount"),
      align: "right",
      cell: (row) => (
        <span className="num whitespace-nowrap font-medium">
          {formatCurrency(row.amount, currency)}
        </span>
      )
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="drilldown">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}

        {nothingToShow !== null || rows === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{nothingToShow}</p>
        ) : (
          <ResponsiveTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={columns}
            /* The sum of what is listed, so it can be held against the figure
               that was clicked. A mismatch means the filters behind the two
               differ, and that is worth seeing rather than hiding. */
            footer={
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{t("drill.total", { n: rows.length })}</span>
                <span className="num" data-testid="drill-total">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
