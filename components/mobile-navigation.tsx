"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp,
  BarChart3,
  CalendarClock,
  Download,
  Flag,
  Gauge,
  LayoutDashboard,
  Menu,
  Settings,
  WalletCards
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/transactions", label: "Операции", icon: ArrowDownUp },
  { href: "/budgets", label: "Бюджеты", icon: Gauge },
  { href: "/investments", label: "Рынок", icon: BarChart3 },
  { href: "/settings", label: "Еще", icon: Menu }
];

const secondaryItems = [
  { href: "/recurring", label: "Плановые", icon: CalendarClock },
  { href: "/accounts", label: "Счета", icon: WalletCards },
  { href: "/goals", label: "Цели", icon: Flag },
  { href: "/import", label: "Импорт", icon: Download },
  { href: "/settings", label: "Настройки", icon: Settings }
];

export function MobileTopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 px-4 py-3 shadow-soft backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="min-w-0">
          <span className="block truncate text-sm font-semibold">{APP_NAME}</span>
          <span className="block text-xs text-muted-foreground">PWA-ready MVP</span>
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
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground",
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
