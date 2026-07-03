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
  Repeat,
  Settings,
  Tag,
  TrendingUp,
  WalletCards,
  type LucideIcon
} from "lucide-react";

// Single source of truth for app navigation, shared by the desktop sidebar, the
// mobile bars and the in-page hub tabs, so labels, routes and icons never drift.
//
// To keep the app approachable, the sidebar shows only a handful of top-level
// destinations ("hubs"). Related screens live as tabs *inside* a hub (rendered by
// the HubTabs bar) instead of as separate sidebar buttons.

export type NavItem = { href: string; label: string; labelKey: string; icon: LucideIcon };
export type NavTab = { href: string; label: string; labelKey: string; icon: LucideIcon };
export type HubGroup = { landing: string; tabs: NavTab[] };

// A hub groups several routes under one sidebar button; `landing` is where the
// button points (the first tab). The first matching group owns a path.
export const HUB_GROUPS: HubGroup[] = [
  {
    landing: "/transactions",
    tabs: [
      { href: "/transactions", label: "Операции", labelKey: "nav.transactions", icon: ArrowDownUp },
      { href: "/accounts", label: "Счета", labelKey: "nav.accounts", icon: WalletCards },
      { href: "/debts", label: "Долги", labelKey: "nav.debts", icon: CreditCard },
      { href: "/categories", label: "Категории", labelKey: "nav.categories", icon: Tag },
      { href: "/import", label: "Импорт", labelKey: "nav.import", icon: Download }
    ]
  },
  {
    landing: "/budgets",
    tabs: [
      { href: "/budgets", label: "Бюджеты", labelKey: "nav.budgets", icon: Gauge },
      { href: "/goals", label: "Цели", labelKey: "nav.goals", icon: Flag },
      { href: "/recurring", label: "Плановые", labelKey: "nav.recurring", icon: CalendarClock },
      { href: "/subscriptions", label: "Подписки", labelKey: "nav.subscriptions", icon: Repeat }
    ]
  },
  {
    landing: "/analytics",
    tabs: [
      { href: "/analytics", label: "Аналитика", labelKey: "nav.analytics", icon: TrendingUp },
      { href: "/forecast", label: "Прогноз", labelKey: "nav.forecast", icon: LineChart },
      { href: "/reports", label: "Отчёты", labelKey: "nav.reports", icon: FileText }
    ]
  }
];

// The six top-level destinations shown in the sidebar / mobile bottom bar. The
// "Учёт" and "Планирование" buttons land on a hub whose other screens are tabs.
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Главная", labelKey: "nav.home", icon: LayoutDashboard },
  { href: "/transactions", label: "Учёт", labelKey: "section.accounting", icon: ArrowDownUp },
  { href: "/budgets", label: "Планирование", labelKey: "section.planning", icon: Gauge },
  { href: "/analytics", label: "Аналитика", labelKey: "nav.analytics", icon: TrendingUp },
  { href: "/investments", label: "Инвестиции", labelKey: "nav.investments", icon: BarChart3 },
  { href: "/settings", label: "Настройки", labelKey: "nav.settings", icon: Settings }
];

// The hub (if any) that owns the current path — used by the in-page tab bar.
export function findHub(pathname: string): HubGroup | null {
  return HUB_GROUPS.find((group) => group.tabs.some((tab) => tab.href === pathname)) ?? null;
}

// Which sidebar button should be highlighted for a given path: the owning hub's
// landing route, or the path itself for standalone destinations.
export function activeNavHref(pathname: string): string {
  return findHub(pathname)?.landing ?? pathname;
}

// Mobile bottom bar mirrors the sidebar; the hub tab bar handles sub-navigation.
export const MOBILE_PRIMARY: NavItem[] = MAIN_NAV;
