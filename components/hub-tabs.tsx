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
    <div
      data-testid="hub-tabs"
      // The design's strip: pills on the ground (no card, no border), scrolling
      // sideways with proximity snap and no visible scrollbar. The owner chose
      // this over the wrapping rows the app had.
      className="fa-hubstrip -mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {hub.tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 snap-start whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              active
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
