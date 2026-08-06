import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type RowTone = "default" | "success" | "danger" | "muted";

const dotTone: Record<RowTone, string> = {
  default: "bg-primary",
  success: "bg-success",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/50"
};

// One line of a list, in the four zones the design uses everywhere: a round
// badge, the name with its sub-line, the value with its sub-line, and a status
// dot. Renders as a link when `href` is given, otherwise as a plain row.
export function ListRow({
  icon: Icon,
  badge,
  title,
  subtitle,
  value,
  valueCaption,
  valueTone = "default",
  tone = "default",
  href,
  trailing,
  children
}: {
  icon?: LucideIcon;
  /** Text badge instead of an icon — e.g. a ticker's first letters. */
  badge?: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueCaption?: string;
  /** Colours the value only; the dot follows `tone`. */
  valueTone?: RowTone;
  tone?: RowTone;
  href?: string;
  /** Replaces the status dot (a chevron, a menu button). */
  trailing?: ReactNode;
  /** Rendered under the row — a progress bar, for instance. */
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center gap-3">
        {Icon || badge ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
            {Icon ? <Icon className="size-4" aria-hidden /> : badge}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {subtitle ? (
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
        {value ? (
          <span className="shrink-0 text-right">
            <span
              className={cn(
                "num block text-sm font-semibold",
                valueTone === "success" && "text-success",
                valueTone === "danger" && "text-destructive",
                valueTone === "muted" && "text-muted-foreground"
              )}
            >
              {value}
            </span>
            {valueCaption ? (
              <span className="block text-xs text-muted-foreground">{valueCaption}</span>
            ) : null}
          </span>
        ) : null}
        {trailing ?? (
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dotTone[tone])} />
        )}
      </div>
      {children}
    </>
  );

  if (href) {
    return (
      <li>
        <Link href={href} className="block py-2.5 transition-colors hover:bg-foreground/[0.03]">
          {body}
        </Link>
      </li>
    );
  }

  return <li className="py-2.5">{body}</li>;
}

/** The <ul> that holds `ListRow`s, with the hairline between them. */
export function ListRows({ children }: { children: ReactNode }) {
  return <ul className="mt-2 divide-y">{children}</ul>;
}
