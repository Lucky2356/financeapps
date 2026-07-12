import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-56 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-gradient-to-b from-muted/30 to-transparent p-10 text-center">
      {/* Soft radial glow behind the icon for a touch of depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_70%)]"
      />
      <div className="relative flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-soft-sm">
        <Icon className="size-7" />
      </div>
      <h3 className="relative mt-4 text-base font-semibold">{title}</h3>
      <p className="relative mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="relative mt-5">{action}</div> : null}
    </div>
  );
}
