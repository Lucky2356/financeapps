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

// `label` is the Russian default (fallback). `labelKey` resolves the translated
// string via the i18n catalog (see lib/i18n); section labels carry `labelKey` too.
export type NavItem = { href: string; label: string; labelKey: string; icon: LucideIcon };
export type NavSection = { label: string | null; labelKey?: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ href: "/", label: "Главная", labelKey: "nav.home", icon: LayoutDashboard }]
  },
  {
    label: "Учёт",
    labelKey: "section.accounting",
    items: [
      { href: "/transactions", label: "Операции", labelKey: "nav.transactions", icon: ArrowDownUp },
      { href: "/accounts", label: "Счета", labelKey: "nav.accounts", icon: WalletCards },
      { href: "/debts", label: "Долги", labelKey: "nav.debts", icon: CreditCard },
      { href: "/categories", label: "Категории", labelKey: "nav.categories", icon: Tag }
    ]
  },
  {
    label: "Планирование",
    labelKey: "section.planning",
    items: [
      { href: "/budgets", label: "Бюджеты", labelKey: "nav.budgets", icon: Gauge },
      { href: "/goals", label: "Цели", labelKey: "nav.goals", icon: Flag },
      { href: "/recurring", label: "Плановые", labelKey: "nav.recurring", icon: CalendarClock },
      { href: "/subscriptions", label: "Подписки", labelKey: "nav.subscriptions", icon: Repeat },
      { href: "/forecast", label: "Прогноз", labelKey: "nav.forecast", icon: LineChart },
      { href: "/analytics", label: "Аналитика", labelKey: "nav.analytics", icon: TrendingUp }
    ]
  },
  {
    label: "Рынок",
    labelKey: "section.market",
    items: [
      { href: "/investments", label: "Инвестиции", labelKey: "nav.investments", icon: BarChart3 }
    ]
  },
  {
    label: "Прочее",
    labelKey: "section.other",
    items: [
      { href: "/reports", label: "Отчёты", labelKey: "nav.reports", icon: FileText },
      { href: "/import", label: "Импорт", labelKey: "nav.import", icon: Download },
      { href: "/settings", label: "Настройки", labelKey: "nav.settings", icon: Settings }
    ]
  }
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

// Mobile bottom bar: the 5 most-used destinations, with a compact "Ещё" entry.
export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/", label: "Главная", labelKey: "nav.home", icon: LayoutDashboard },
  { href: "/transactions", label: "Операции", labelKey: "nav.transactions", icon: ArrowDownUp },
  { href: "/budgets", label: "Бюджеты", labelKey: "nav.budgets", icon: Gauge },
  { href: "/investments", label: "Рынок", labelKey: "nav.market", icon: BarChart3 },
  { href: "/settings", label: "Ещё", labelKey: "nav.more", icon: Menu }
];

const PRIMARY_DESTINATIONS = new Set(["/", "/transactions", "/budgets", "/investments"]);

// Everything not already on the bottom bar — shown in the scrollable mobile top bar.
export const MOBILE_SECONDARY: NavItem[] = NAV_ITEMS.filter(
  (item) => !PRIMARY_DESTINATIONS.has(item.href)
);
