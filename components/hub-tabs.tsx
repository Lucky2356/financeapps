"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useHiddenSections } from "@/hooks/use-hidden-sections";
import { fadeAttribute, useScrollEdges } from "@/hooks/use-scroll-edges";
import { useI18n } from "@/lib/i18n/context";
import { findHub, type NavSurface, type NavTab } from "@/lib/navigation";
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
  const { hidden } = useHiddenSections();
  const hub = findHub(pathname, surface);
  if (!hub) return null;
  // Скрытая вкладка исчезает, а та, на которой сейчас человек, остаётся: иначе
  // экран, открытый по ссылке, выглядел бы потерянным.
  const tabs = hub.tabs.filter((tab) => tab.href === pathname || !hidden.has(tab.href));

  return <StripBar surface={surface} className={className} tabs={tabs} pathname={pathname} />;
}

function StripBar({
  surface,
  className,
  tabs,
  pathname
}: {
  surface: NavSurface;
  className: string;
  tabs: NavTab[];
  pathname: string;
}) {
  const { t } = useI18n();
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  // Полосы без полосы прокрутки не видно, что она прокручивается: на телефоне
  // последняя вкладка просто обрывалась («Subsc»). Край, за которым есть ещё,
  // гаснет (data-fade → маска в globals.css) — так видно, что дальше продолжение.
  const edges = useScrollEdges(stripRef);

  // Открытая вкладка — в поле зрения. Пришедший по ссылке на «Подписки» иначе
  // видел полосу с начала, а свою вкладку — за краем экрана.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = activeRef.current;
    if (!strip || !tab) return;
    const left =
      tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    const right = left + tab.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, left - 24);
    }
  }, [pathname]);

  return (
    <div
      ref={stripRef}
      data-testid="hub-tabs"
      data-surface={surface}
      data-fade={fadeAttribute(edges)}
      // The design's strip: pills on the ground (no card, no border), scrolling
      // sideways with proximity snap and no visible scrollbar. The owner chose
      // this over the wrapping rows the app had.
      className={cn("fa-hubstrip -mx-1 mb-3 gap-1.5 overflow-x-auto px-1 pb-1", className)}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            ref={active ? activeRef : undefined}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 snap-start whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              active
                ? "bg-secondary text-foreground"
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
