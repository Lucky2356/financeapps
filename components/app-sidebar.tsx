"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Download,
  Flag,
  Gauge,
  LayoutDashboard,
  Settings,
  WalletCards
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/transactions", label: "Операции", icon: ArrowDownUp },
  { href: "/recurring", label: "Плановые", icon: CalendarClock },
  { href: "/accounts", label: "Счета", icon: WalletCards },
  { href: "/budgets", label: "Бюджеты", icon: Gauge },
  { href: "/goals", label: "Цели", icon: Flag },
  { href: "/investments", label: "Инвестиции", icon: BarChart3 },
  { href: "/import", label: "Импорт", icon: Download },
  { href: "/settings", label: "Настройки", icon: Settings }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-72 shrink-0 flex-col border-r bg-card/95 backdrop-blur md:flex">
      <div className="block w-full p-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CircleDollarSign className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{APP_NAME}</span>
            <span className="block text-xs text-muted-foreground">Личные финансы и рынок РФ</span>
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "secondary" : "ghost"}
              className={cn("relative justify-start", active && "font-semibold before:absolute before:left-0 before:h-5 before:w-1 before:rounded-r before:bg-primary")}
            >
              <Link href={item.href}>
                <Icon className="size-4" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <div>
            <p className="text-sm font-medium">Тема</p>
            <p className="text-xs text-muted-foreground">Светлая / темная</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
