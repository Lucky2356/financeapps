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
  LineChart,
  LayoutDashboard,
  Settings,
  Tag,
  TrendingUp,
  WalletCards
} from "lucide-react";

import { NotificationBell } from "@/components/notification-bell";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const navSections = [
  {
    label: null,
    items: [{ href: "/", label: "Главная", icon: LayoutDashboard }]
  },
  {
    label: "Учёт",
    items: [
      { href: "/transactions", label: "Операции", icon: ArrowDownUp },
      { href: "/accounts", label: "Счета", icon: WalletCards },
      { href: "/categories", label: "Категории", icon: Tag }
    ]
  },
  {
    label: "Планирование",
    items: [
      { href: "/budgets", label: "Бюджеты", icon: Gauge },
      { href: "/goals", label: "Цели", icon: Flag },
      { href: "/recurring", label: "Плановые", icon: CalendarClock },
      { href: "/forecast", label: "Прогноз", icon: LineChart },
      { href: "/analytics", label: "Аналитика", icon: TrendingUp }
    ]
  },
  {
    label: "Рынок",
    items: [{ href: "/investments", label: "Инвестиции", icon: BarChart3 }]
  },
  {
    label: "Прочее",
    items: [
      { href: "/import", label: "Импорт", icon: Download },
      { href: "/settings", label: "Настройки", icon: Settings }
    ]
  }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col bg-sidebar md:flex">
      {/* Logo */}
      <div className="border-b border-sidebar-border p-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-emerald-400/80 text-white shadow-sm">
            <CircleDollarSign className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">{APP_NAME}</span>
            <span className="block text-[11px] text-sidebar-muted">Личные финансы</span>
          </span>
        </Link>
      </div>

      <ProfileSwitcher />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {navSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-4" : undefined}>
            {section.label ? (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted/70">
                {section.label}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                      active
                        ? "bg-sidebar-accent/15 font-semibold text-sidebar-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-sidebar-accent before:content-['']"
                        : "text-sidebar-muted hover:bg-sidebar-border/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-sidebar-muted">Тема и уведомления</p>
          <div className="flex items-center gap-0.5">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
