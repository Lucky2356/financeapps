"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/context";

// Generic page skeleton: a heading block plus a few card placeholders. Mirrors
// the common page-grid layout so there is no layout shift when content arrives.
export default function Loading() {
  const { t } = useI18n();
  return (
    <output className="page-grid" aria-label={t("loading.generic")}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </output>
  );
}
