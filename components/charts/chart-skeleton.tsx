"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

// Placeholder shown while a (lazily-loaded) Recharts chart is being fetched.
// Keeps the same height as the real chart so layout does not shift.
export function ChartSkeleton({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <output
      className={cn("block h-64 w-full sm:h-72", className)}
      aria-label={t("chart.aria.loading")}
    >
      <Skeleton className="h-full w-full" />
    </output>
  );
}
