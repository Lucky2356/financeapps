"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/lib/i18n/context";
import { findHub } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// Sub-navigation for grouped sections ("hubs"): when the current route belongs to
// a hub, this renders a tab bar to its sibling screens. Keeps the sidebar short
// while leaving every page one click away. Renders nothing outside a hub.
export function HubTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const hub = findHub(pathname);
  if (!hub) return null;

  // On a phone (and on a tablet, where the sidebar already eats 16rem) the tabs
  // WRAP into rows instead of scrolling sideways: a hidden tab off the right
  // edge — and a clipped active one — was the single worst part of the mobile
  // layout. Four tabs wrap 2+2, five wrap 3+2, and `grow` stretches the last row
  // so every row looks deliberate. Only from `lg` is the content column wide
  // enough to seat every tab in one row without cutting a label.
  const twoPerRow = hub.tabs.length === 4;

  return (
    <div
      data-testid="hub-tabs"
      className="mb-5 flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1 shadow-soft"
    >
      {hub.tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Stacked in a narrow cell so the full label fits ("Transactions"
              // would otherwise be clipped next to the icon).
              "flex min-w-0 grow flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-all duration-150",
              "lg:basis-0 lg:flex-row lg:gap-2 lg:px-3 lg:py-2 lg:text-sm",
              twoPerRow ? "basis-[calc(50%-0.125rem)]" : "basis-[calc(33.333%-0.167rem)]",
              active
                ? "bg-background text-primary shadow-sm ring-1 ring-primary/10"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "opacity-70")} />
            <span className="truncate">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </div>
  );
}
