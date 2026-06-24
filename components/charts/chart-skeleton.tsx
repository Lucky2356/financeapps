import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Placeholder shown while a (lazily-loaded) Recharts chart is being fetched.
// Keeps the same height as the real chart so layout does not shift.
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-64 w-full sm:h-72", className)}
      role="status"
      aria-label="Загрузка графика"
    >
      <Skeleton className="h-full w-full" />
    </div>
  );
}
