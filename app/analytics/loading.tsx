import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Analytics skeleton: heading plus a couple of chart placeholders.
export default function Loading() {
  return (
    <div className="page-grid" role="status" aria-label="Загрузка аналитики">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  );
}
