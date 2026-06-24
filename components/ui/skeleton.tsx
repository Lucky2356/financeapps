import { cn } from "@/lib/utils";

// Neutral shimmering placeholder for content that is still loading. Mirrors the
// shadcn/ui skeleton primitive.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
