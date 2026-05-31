"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { MOBILE_PRIMARY, MOBILE_SECONDARY } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const primaryItems = MOBILE_PRIMARY;
const secondaryItems = MOBILE_SECONDARY;

export function MobileTopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 px-4 py-3 shadow-soft backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="min-w-0">
          <span className="block truncate text-sm font-semibold">{APP_NAME}</span>
          <span className="block text-xs text-muted-foreground">Личные финансы</span>
        </Link>
        <ThemeToggle />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {secondaryItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === pathname;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium",
                active ? "bg-secondary text-foreground" : "bg-card text-muted-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {primaryItems.map((item) => {
          const active = pathname === item.href || (item.href === "/settings" && secondaryItems.some((sub) => sub.href === pathname));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-muted-foreground",
                active && "bg-secondary text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
