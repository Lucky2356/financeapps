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

  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1 shadow-soft">
      {hub.tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
              active
                ? "bg-background text-primary shadow-sm ring-1 ring-primary/10"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "opacity-70")} />
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
