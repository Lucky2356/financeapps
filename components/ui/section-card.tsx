import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// A list block: title on the left, an optional "see everything" link on the
// right, content below. The design's third element, used on every screen so
// lists read the same everywhere.
export function SectionCard({
  title,
  action,
  actionHref,
  children,
  className
}: {
  title: string;
  /** Label for the right-hand link; requires `actionHref`. */
  action?: string;
  actionHref?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-5 shadow-soft", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
        {action && actionHref ? (
          <Link
            href={actionHref}
            className="shrink-0 text-sm font-medium text-primary transition-opacity hover:opacity-80"
          >
            {action}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
