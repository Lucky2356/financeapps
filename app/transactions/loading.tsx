"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/context";

// Transactions list skeleton: heading, filter bar, and a stack of table rows.
export default function Loading() {
  const { t } = useI18n();
  return (
    <output className="page-grid" aria-label={t("loading.transactions")}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </output>
  );
}
