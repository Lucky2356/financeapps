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
  Scale,
  Settings,
  Tag,
  TrendingUp,
  WalletCards,
  type LucideIcon
} from "lucide-react";

// Single source of truth for app navigation, shared by the desktop sidebar, the
// mobile bars and the in-page hub tabs, so labels, routes and icons never drift.
//
// The two surfaces carry DIFFERENT structures, and deliberately so. A phone bar
// holds four destinations, so screens are folded into a handful of hubs and
// reached through the tab strip. A desktop window has a full-height sidebar with
// room for ten, so the screens the owner opens daily — accounts, categories,
// limits, goals — sit there in the open instead of behind a tab.

export type NavItem = { href: string; label: string; labelKey: string; icon: LucideIcon };
export type NavTab = { href: string; label: string; labelKey: string; icon: LucideIcon };
export type HubGroup = { landing: string; tabs: NavTab[] };
/** Which set of structures to answer with — the two are not interchangeable. */
export type NavSurface = "desktop" | "mobile";

const TAB = {
  transactions: {
    href: "/transactions",
    label: "Операции",
    labelKey: "nav.transactions",
    icon: ArrowDownUp
  },
  accounts: { href: "/accounts", label: "Счета", labelKey: "nav.accounts", icon: WalletCards },
  debts: { href: "/debts", label: "Долги", labelKey: "nav.debts", icon: CreditCard },
  categories: { href: "/categories", label: "Категории", labelKey: "nav.categories", icon: Tag },
  import: { href: "/import", label: "Импорт", labelKey: "nav.import", icon: Download },
  analytics: {
    href: "/analytics",
    label: "Аналитика",
    labelKey: "nav.analytics",
    icon: TrendingUp
  },
  forecast: { href: "/forecast", label: "Прогноз", labelKey: "nav.forecast", icon: LineChart },
  reports: { href: "/reports", label: "Отчёты", labelKey: "nav.reports", icon: FileText },
  plan: { href: "/plan", label: "План/факт", labelKey: "nav.planFact", icon: Scale },
  budgets: { href: "/budgets", label: "Лимиты", labelKey: "nav.limits", icon: Gauge },
  goals: { href: "/goals", label: "Цели", labelKey: "nav.goals", icon: Flag },
  recurring: {
    href: "/recurring",
    label: "Плановые",
    labelKey: "nav.recurring",
    icon: CalendarClock
  },
  subscriptions: {
    href: "/subscriptions",
    label: "Подписки",
    labelKey: "nav.subscriptions",
    icon: Repeat
  }
} satisfies Record<string, NavTab>;

// A hub groups several routes under one sidebar button; `landing` is where the
// button points (the first tab). The first matching group owns a path.
export const HUB_GROUPS: HubGroup[] = [
  {
    landing: "/transactions",
    tabs: [
      TAB.transactions,
      TAB.accounts,
      TAB.debts,
      TAB.categories,
      TAB.import,
      // The design folds the read-only screens into the same hub: they answer
      // questions about the ledger, so they belong beside it rather than behind
      // a bottom-bar slot of their own.
      TAB.analytics,
      TAB.forecast,
      TAB.reports,
      TAB.plan
    ]
  },
  {
    landing: "/budgets",
    tabs: [TAB.budgets, TAB.goals, TAB.recurring, TAB.subscriptions]
  }
];

// The five top-level destinations shown in the mobile "more" surfaces. The
// "Учёт" and "Планирование" buttons land on a hub whose other screens are tabs.
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Главная", labelKey: "nav.home", icon: LayoutDashboard },
  { href: "/transactions", label: "Учёт", labelKey: "section.accounting", icon: ArrowDownUp },
  { href: "/budgets", label: "Планирование", labelKey: "section.planning", icon: Gauge },
  { href: "/investments", label: "Инвестиции", labelKey: "nav.investments", icon: BarChart3 },
  { href: "/settings", label: "Настройки", labelKey: "nav.settings", icon: Settings }
];

// The desktop sidebar, in the order the owner asked for. Accounts, categories,
// limits and goals are destinations of their own here; only the three groups
// below still carry tabs, and each carries only what belongs to it.
export const DESKTOP_NAV: NavItem[] = [
  { href: "/", label: "Главная", labelKey: "nav.home", icon: LayoutDashboard },
  { href: "/accounts", label: "Счета", labelKey: "nav.accounts", icon: WalletCards },
  { href: "/categories", label: "Категории", labelKey: "nav.categories", icon: Tag },
  { href: "/transactions", label: "Учёт", labelKey: "section.accounting", icon: ArrowDownUp },
  { href: "/budgets", label: "Лимиты", labelKey: "nav.limits", icon: Gauge },
  { href: "/goals", label: "Цели", labelKey: "nav.goals", icon: Flag },
  {
    href: "/recurring",
    label: "Планирование",
    labelKey: "section.planning",
    icon: CalendarClock
  },
  { href: "/analytics", label: "Аналитика", labelKey: "nav.analytics", icon: TrendingUp },
  { href: "/investments", label: "Инвестиции", labelKey: "nav.investments", icon: BarChart3 },
  { href: "/settings", label: "Настройки", labelKey: "nav.settings", icon: Settings }
];

export const DESKTOP_HUBS: HubGroup[] = [
  // The ledger and the two screens that only exist to feed it.
  { landing: "/transactions", tabs: [TAB.transactions, TAB.debts, TAB.import] },
  // What is planned but has not happened yet. Subscriptions are recurring
  // payments by another name, so they live beside the scheduled ones.
  { landing: "/recurring", tabs: [TAB.recurring, TAB.subscriptions] },
  // Reading the money rather than recording it.
  { landing: "/analytics", tabs: [TAB.analytics, TAB.forecast, TAB.reports, TAB.plan] }
];

export function hubsFor(surface: NavSurface): HubGroup[] {
  return surface === "desktop" ? DESKTOP_HUBS : HUB_GROUPS;
}

export function navFor(surface: NavSurface): NavItem[] {
  return surface === "desktop" ? DESKTOP_NAV : MAIN_NAV;
}

// The hub (if any) that owns the current path — used by the in-page tab bar.
export function findHub(pathname: string, surface: NavSurface = "mobile"): HubGroup | null {
  return hubsFor(surface).find((group) => group.tabs.some((tab) => tab.href === pathname)) ?? null;
}

// Which sidebar button should be highlighted for a given path: the owning hub's
// landing route, or the path itself for standalone destinations.
export function activeNavHref(pathname: string, surface: NavSurface = "mobile"): string {
  return findHub(pathname, surface)?.landing ?? pathname;
}

// The phone bar carries FOUR destinations plus the round add button in the
// middle (rendered by MobileBottomNav, not listed here). Settings moved to the
// header icon, and Analytics is now a tab inside the accounting hub — that is
// what frees the two slots the add button needs.
export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/", label: "Главная", labelKey: "nav.home", icon: LayoutDashboard },
  { href: "/transactions", label: "Учёт", labelKey: "section.accounting", icon: ArrowDownUp },
  { href: "/budgets", label: "Планы", labelKey: "nav.short.planning", icon: Gauge },
  { href: "/investments", label: "Инвест.", labelKey: "nav.short.investments", icon: BarChart3 }
];
