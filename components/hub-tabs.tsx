"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/lib/i18n/context";
import { findHub, type NavSurface } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// Sub-navigation for grouped sections ("hubs"): when the current route belongs to
// a hub, this renders a tab bar to its sibling screens. Keeps the sidebar short
// while leaving every page one click away. Renders nothing outside a hub.
//
// The two surfaces group screens differently, so both strips are rendered and
// the breakpoint picks one. It has to be CSS rather than a width check: the app
// ships as a static export, and measuring the window first would flash the
// wrong strip on every load.
export function HubTabs() {
  return (
    <>
      <Strip surface="desktop" className="hidden md:flex" />
      <Strip surface="mobile" className="flex md:hidden" />
    </>
  );
}

function Strip({ surface, className }: { surface: NavSurface; className: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const hub = findHub(pathname, surface);
  if (!hub) return null;

  return (
    <div
      data-testid="hub-tabs"
      data-surface={surface}
      // The design's strip: pills on the ground (no card, no border), scrolling
      // sideways with proximity snap and no visible scrollbar. The owner chose
      // this over the wrapping rows the app had.
      className={cn("fa-hubstrip -mx-1 mb-3 gap-1.5 overflow-x-auto px-1 pb-1", className)}
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
