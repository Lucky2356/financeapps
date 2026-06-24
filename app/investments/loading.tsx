import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Investments skeleton: heading, summary cards, and a chart placeholder.
export default function Loading() {
  return (
    <div className="page-grid" role="status" aria-label="Загрузка инвестиций">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <ChartSkeleton />
    </div>
  );
}
