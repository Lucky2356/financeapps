import {
  ArrowDownUp,
  BarChart3,
  CalendarClock,
  CreditCard,
  Download,
  FileText,
  Flag,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  Repeat,
  Settings,
  Tag,
  TrendingUp,
  WalletCards,
  type LucideIcon
} from "lucide-react";

// Single source of truth for app navigation, shared by the desktop sidebar and
// the mobile bars so labels, routes and icons can never drift apart.

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavSection = { label: string | null; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ href: "/", label: "Главная", icon: LayoutDashboard }] },
  {
    label: "Учёт",
    items: [
      { href: "/transactions", label: "Операции", icon: ArrowDownUp },
      { href: "/accounts", label: "Счета", icon: WalletCards },
      { href: "/debts", label: "Долги", icon: CreditCard },
      { href: "/categories", label: "Категории", icon: Tag }
    ]
  },
  {
    label: "Планирование",
    items: [
      { href: "/budgets", label: "Бюджеты", icon: Gauge },
      { href: "/goals", label: "Цели", icon: Flag },
      { href: "/recurring", label: "Плановые", icon: CalendarClock },
      { href: "/subscriptions", label: "Подписки", icon: Repeat },
      { href: "/forecast", label: "Прогноз", icon: LineChart },
      { href: "/analytics", label: "Аналитика", icon: TrendingUp }
    ]
  },
  { label: "Рынок", items: [{ href: "/investments", label: "Инвестиции", icon: BarChart3 }] },
  {
    label: "Прочее",
    items: [
      { href: "/reports", label: "Отчёты", icon: FileText },
      { href: "/import", label: "Импорт", icon: Download },
      { href: "/settings", label: "Настройки", icon: Settings }
    ]
  }
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

// Mobile bottom bar: the 5 most-used destinations, with a compact "Ещё" entry.
export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/", label: "Главная", icon: LayoutDashboard },
  { href: "/transactions", label: "Операции", icon: ArrowDownUp },
  { href: "/budgets", label: "Бюджеты", icon: Gauge },
  { href: "/investments", label: "Рынок", icon: BarChart3 },
  { href: "/settings", label: "Ещё", icon: Menu }
];

const PRIMARY_DESTINATIONS = new Set(["/", "/transactions", "/budgets", "/investments"]);

// Everything not already on the bottom bar — shown in the scrollable mobile top bar.
export const MOBILE_SECONDARY: NavItem[] = NAV_ITEMS.filter(
  (item) => !PRIMARY_DESTINATIONS.has(item.href)
);
