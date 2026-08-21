"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A card that can be folded away, remembering the choice per device.
 *
 * Several screens had grown into a column of panels that each answered a
 * question asked once a month, and all of them were open all of the time. This
 * gives a panel a lid without hiding it: the title stays on screen, so what is
 * in there is still discoverable — it just is not in the way.
 */
export function CollapsibleCard({
  title,
  icon: Icon,
  storageKey,
  defaultOpen = false,
  summary,
  children,
  className
}: {
  title: string;
  icon?: LucideIcon;
  /** Where the open/closed choice is kept; omit to make it forget. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** A line shown next to the title while the card is shut. */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(`collapse:${storageKey}`);
      if (stored === "1" || stored === "0") {
        void Promise.resolve().then(() => setOpen(stored === "1"));
      }
    } catch {
      /* storage unavailable — keep the default */
    }
  }, [storageKey]);

  function toggle() {
    setOpen((previous) => {
      const next = !previous;
      try {
        if (storageKey) localStorage.setItem(`collapse:${storageKey}`, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }

  return (
    <Card className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-5 text-left"
      >
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <CardTitle className="min-w-0 flex-1 truncate">{title}</CardTitle>
        {!open && summary ? (
          <span className="shrink-0 text-sm text-muted-foreground">{summary}</span>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? <CardContent className="pt-0">{children}</CardContent> : null}
    </Card>
  );
}
