"use client";

import Link from "next/link";
import type { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { TransactionsPageData } from "@/lib/data";
import { useI18n } from "@/lib/i18n/context";

export function TransactionPagination({
  data,
  searchParams
}: {
  data: TransactionsPageData;
  searchParams: ReturnType<typeof useSearchParams>;
}) {
  const { t } = useI18n();
  const { page, limit, total, hasPreviousPage, hasNextPage } = data.pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    params.set("limit", String(limit));
    const query = params.toString();
    return query ? `/transactions?${query}` : "/transactions";
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{t("tx.page.showing", { from, to, total })}</span>
      <div className="flex gap-2">
        {hasPreviousPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page - 1)}>{t("tx.page.prev")}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {t("tx.page.prev")}
          </Button>
        )}
        {hasNextPage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(page + 1)}>{t("tx.page.next")}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {t("tx.page.next")}
          </Button>
        )}
      </div>
    </div>
  );
}
