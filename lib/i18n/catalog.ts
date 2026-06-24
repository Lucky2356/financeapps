// Lightweight i18n catalog. No runtime deps and works in the static (desktop)
// export — locale is resolved on the client (see context.tsx). Russian is the
// source/fallback language; English is provided for the app shell. Strings not
// yet translated fall back to Russian, then to the key, so nothing ever breaks.
//
// Translation is incremental: the shell (navigation, errors, settings) is
// covered here; page content is migrated key-by-key over time.

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";

export type Messages = Record<string, string>;

const ru: Messages = {
  // App shell
  "shell.subtitle": "Личные финансы",
  "shell.search": "Поиск…",
  "shell.themeAndNotifications": "Тема и уведомления",
  // Navigation sections
  "section.accounting": "Учёт",
  "section.planning": "Планирование",
  "section.market": "Рынок",
  "section.other": "Прочее",
  // Navigation items
  "nav.home": "Главная",
  "nav.transactions": "Операции",
  "nav.accounts": "Счета",
  "nav.debts": "Долги",
  "nav.categories": "Категории",
  "nav.budgets": "Бюджеты",
  "nav.goals": "Цели",
  "nav.recurring": "Плановые",
  "nav.subscriptions": "Подписки",
  "nav.forecast": "Прогноз",
  "nav.analytics": "Аналитика",
  "nav.investments": "Инвестиции",
  "nav.reports": "Отчёты",
  "nav.import": "Импорт",
  "nav.settings": "Настройки",
  "nav.market": "Рынок",
  "nav.more": "Ещё",
  // Error boundaries
  "error.title": "Что-то пошло не так",
  "error.description": "Произошла ошибка при отображении этой страницы.",
  "error.retry": "Попробовать снова",
  // Settings: language
  "settings.language.title": "Язык интерфейса",
  "settings.language.hint":
    "Часть интерфейса уже переведена; остальные разделы переводятся постепенно.",
  "settings.language.ru": "Русский",
  "settings.language.en": "English"
};

const en: Messages = {
  // App shell
  "shell.subtitle": "Personal finance",
  "shell.search": "Search…",
  "shell.themeAndNotifications": "Theme and notifications",
  // Navigation sections
  "section.accounting": "Accounting",
  "section.planning": "Planning",
  "section.market": "Market",
  "section.other": "Other",
  // Navigation items
  "nav.home": "Home",
  "nav.transactions": "Transactions",
  "nav.accounts": "Accounts",
  "nav.debts": "Debts",
  "nav.categories": "Categories",
  "nav.budgets": "Budgets",
  "nav.goals": "Goals",
  "nav.recurring": "Scheduled",
  "nav.subscriptions": "Subscriptions",
  "nav.forecast": "Forecast",
  "nav.analytics": "Analytics",
  "nav.investments": "Investments",
  "nav.reports": "Reports",
  "nav.import": "Import",
  "nav.settings": "Settings",
  "nav.market": "Market",
  "nav.more": "More",
  // Error boundaries
  "error.title": "Something went wrong",
  "error.description": "An error occurred while rendering this page.",
  "error.retry": "Try again",
  // Settings: language
  "settings.language.title": "Interface language",
  "settings.language.hint":
    "Part of the interface is translated; the rest is migrated gradually.",
  "settings.language.ru": "Русский",
  "settings.language.en": "English"
};

export const CATALOGS: Record<Locale, Messages> = { ru, en };

// Resolve a key for a locale: locale → Russian fallback → the key itself.
// `vars` interpolates {placeholders}.
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const template = CATALOGS[locale]?.[key] ?? CATALOGS.ru[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}
