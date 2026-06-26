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
  "settings.language.en": "English",
  // Command palette
  "cmd.placeholder": "Поиск разделов, счетов, категорий, операций…",
  "cmd.nothingFound": "Ничего не найдено",
  "cmd.footer": "↑↓ выбрать · Enter открыть · Esc закрыть",
  "cmd.group.navigation": "Навигация",
  "cmd.group.actions": "Действия",
  "cmd.group.accounts": "Счета",
  "cmd.group.categories": "Категории",
  "cmd.group.transactions": "Операции",
  "cmd.addTransaction": "Добавить операцию",
  "cmd.recurring": "Плановые платежи",
  "cmd.importExport": "Импорт и экспорт",
  "cmd.account": "Счёт",
  "cmd.incomeCategory": "Категория дохода",
  "cmd.expenseCategory": "Категория расхода",
  // Page headers
  "page.home.title": "Главная",
  "page.home.desc": "Финансовая картина месяца и динамика расходов.",
  "page.transactions.title": "Операции",
  "page.transactions.desc":
    "Ручной ввод, редактирование, удаление и фильтрация доходов и расходов.",
  "page.accounts.title": "Счета",
  "page.accounts.desc":
    "Наличные, карта, накопительный и брокерский счет с расчетом общего баланса.",
  "page.debts.title": "Долги",
  "page.debts.desc":
    "Кредиты, рассрочки и другие обязательства. Уменьшают чистый капитал; помогаем спланировать погашение.",
  "page.categories.title": "Категории",
  "page.categories.desc":
    "Настройте категории доходов и расходов для точной классификации операций.",
  "page.budgets.title": "Бюджеты",
  "page.budgets.desc": "Лимиты по категориям, прогресс и предупреждения при превышении.",
  "page.budgets.optimization": "Оптимизация расходов",
  "page.goals.title": "Цели",
  "page.goals.desc": "Накопительные цели, прогресс и расчет нужного ежемесячного взноса.",
  "page.recurring.title": "Плановые платежи",
  "page.recurring.desc":
    "Повторяющиеся доходы и расходы, ближайшие обязательства и создание операций по расписанию.",
  "page.subscriptions.title": "Подписки",
  "page.subscriptions.desc":
    "Регулярные платежи в пересчёте на месяц и год — чтобы видеть, во что обходятся подписки.",
  "page.forecast.title": "Прогноз",
  "page.forecast.desc":
    "Плановый денежный поток на 30 и 90 дней, ближайшие обязательства и предупреждения о кассовых разрывах.",
  "page.analytics.title": "Аналитика",
  "page.analytics.desc": "Денежные потоки, динамика сбережений и структура расходов за 6 месяцев.",
  "page.investments.title": "Инвестиции",
  "page.investments.desc":
    "Watchlist, портфель с реальными ценами Московской биржи, структура, риски и образовательные подсказки без индивидуальных инвестиционных рекомендаций.",
  "page.reports.title": "Отчёты",
  "page.reports.desc": "Сводный финансовый отчёт — можно распечатать или сохранить в PDF.",
  "page.import.title": "Импорт и экспорт",
  "page.import.desc":
    "Загрузка CSV с предпросмотром, маппингом колонок и экспорт операций в CSV/JSON.",
  "page.settings.title": "Настройки",
  "page.settings.desc": "Валюта, внешний вид, автоматизация, аккаунт и управление данными.",
  // Generic loading fallbacks
  "loading.generic": "Загрузка…",
  "loading.transactions": "Загружаем операции...",
  "loading.analytics": "Загружаем аналитику...",
  // Common
  "common.empty": "Пусто",
  "reco.empty": "Рекомендаций пока нет. Добавьте больше данных, чтобы анализ стал точнее.",
  "inv.portfolioRisks": "Риски портфеля",
  "inv.educationTips": "Образовательные подсказки"
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
  "settings.language.hint": "Part of the interface is translated; the rest is migrated gradually.",
  "settings.language.ru": "Русский",
  "settings.language.en": "English",
  // Command palette
  "cmd.placeholder": "Search sections, accounts, categories, transactions…",
  "cmd.nothingFound": "Nothing found",
  "cmd.footer": "↑↓ select · Enter open · Esc close",
  "cmd.group.navigation": "Navigation",
  "cmd.group.actions": "Actions",
  "cmd.group.accounts": "Accounts",
  "cmd.group.categories": "Categories",
  "cmd.group.transactions": "Transactions",
  "cmd.addTransaction": "Add transaction",
  "cmd.recurring": "Scheduled payments",
  "cmd.importExport": "Import & export",
  "cmd.account": "Account",
  "cmd.incomeCategory": "Income category",
  "cmd.expenseCategory": "Expense category",
  // Page headers
  "page.home.title": "Home",
  "page.home.desc": "This month's financial picture and spending trend.",
  "page.transactions.title": "Transactions",
  "page.transactions.desc": "Manually add, edit, delete and filter income and expenses.",
  "page.accounts.title": "Accounts",
  "page.accounts.desc": "Cash, card, savings and brokerage accounts with a combined balance.",
  "page.debts.title": "Debts",
  "page.debts.desc":
    "Loans, installments and other liabilities. They reduce net worth; we help you plan payoff.",
  "page.categories.title": "Categories",
  "page.categories.desc": "Set up income and expense categories for accurate classification.",
  "page.budgets.title": "Budgets",
  "page.budgets.desc": "Per-category limits, progress and over-limit warnings.",
  "page.budgets.optimization": "Spending optimization",
  "page.goals.title": "Goals",
  "page.goals.desc": "Savings goals, progress and the required monthly contribution.",
  "page.recurring.title": "Scheduled payments",
  "page.recurring.desc":
    "Recurring income and expenses, upcoming obligations and creating transactions on a schedule.",
  "page.subscriptions.title": "Subscriptions",
  "page.subscriptions.desc":
    "Recurring payments converted to monthly and yearly cost — so you can see what subscriptions cost.",
  "page.forecast.title": "Forecast",
  "page.forecast.desc":
    "Projected cash flow for 30 and 90 days, upcoming obligations and cash-gap warnings.",
  "page.analytics.title": "Analytics",
  "page.analytics.desc": "Cash flows, savings trend and spending structure over 6 months.",
  "page.investments.title": "Investments",
  "page.investments.desc":
    "Watchlist, a portfolio with real Moscow Exchange prices, structure, risks and educational tips with no individual investment advice.",
  "page.reports.title": "Reports",
  "page.reports.desc": "A consolidated financial report — print it or save as PDF.",
  "page.import.title": "Import & export",
  "page.import.desc":
    "Upload CSV with preview and column mapping, and export transactions to CSV/JSON.",
  "page.settings.title": "Settings",
  "page.settings.desc": "Currency, appearance, automation, account and data management.",
  // Generic loading fallbacks
  "loading.generic": "Loading…",
  "loading.transactions": "Loading transactions...",
  "loading.analytics": "Loading analytics...",
  // Common
  "common.empty": "Empty",
  "reco.empty": "No recommendations yet. Add more data so the analysis becomes more accurate.",
  "inv.portfolioRisks": "Portfolio risks",
  "inv.educationTips": "Educational tips"
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
