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
  "error.criticalDescription": "Произошла критическая ошибка приложения.",
  "error.retry": "Попробовать снова",
  "notFound.title": "Страница не найдена",
  "notFound.home": "На главную",
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
  "inv.educationTips": "Образовательные подсказки",
  // Auth marketing panel
  "auth.tagline": "Личные финансы — на десктопе и в вебе",
  "auth.heading": "Держите личные финансы под контролем — без таблиц и хаоса.",
  "auth.feature.accounts": "Счета, операции, переводы и импорт выписок из банков",
  "auth.feature.budgets": "Бюджеты, цели, долги и плановые платежи",
  "auth.feature.forecast": "Прогноз денежного потока, капитал и аналитика",
  "auth.feature.privacy": "Данные изолированы по аккаунту; на десктопе — полностью офлайн",
  "auth.disclaimer":
    "Бесплатно и без рекламы. Инвестиционный раздел носит образовательный характер и не является индивидуальной инвестиционной рекомендацией.",
  // Auth forms
  "auth.login.title": "Вход",
  "auth.register.title": "Регистрация",
  "auth.field.email": "Email",
  "auth.field.password": "Пароль",
  "auth.field.passwordMin": "Пароль (минимум 8 символов)",
  "auth.field.name": "Имя (необязательно)",
  "auth.submit.login": "Войти",
  "auth.submit.loginLoading": "Вход…",
  "auth.submit.register": "Создать аккаунт",
  "auth.submit.registerLoading": "Создание…",
  "auth.noAccount": "Нет аккаунта?",
  "auth.haveAccount": "Уже есть аккаунт?",
  "auth.toRegister": "Зарегистрироваться",
  "auth.toLogin": "Войти",
  "auth.invalidCredentials": "Неверный email или пароль.",
  "auth.registerFailed": "Не удалось зарегистрироваться.",
  "auth.networkError": "Сеть недоступна. Попробуйте ещё раз.",
  "auth.consent.pre": "Я принимаю",
  "auth.consent.mid": "и даю согласие на обработку персональных данных согласно",
  "legal.terms": "Условия",
  "legal.privacy": "Конфиденциальность",
  "legal.privacyPolicy": "Политике конфиденциальности",
  // Settings: status & search
  "set.autosaveHint": "Изменения применяются и сохраняются автоматически.",
  "set.saving": "Сохранение…",
  "set.saved": "Сохранено",
  "set.search": "Поиск по настройкам…",
  "set.sections": "Разделы настроек",
  "set.nothingFound": "Ничего не найдено по запросу «{query}».",
  "set.saveError": "Не удалось сохранить настройки",
  // Settings: sections
  "set.section.general": "Основные",
  "set.section.automation": "Автоматизация",
  "set.section.appearance": "Внешний вид",
  "set.section.ai": "ИИ-ассистент",
  "set.section.risk": "Риск и подушка",
  "set.section.account": "Аккаунт",
  "set.section.data": "Данные",
  "set.section.about": "О приложении",
  // Settings: general
  "set.general.title": "Основные настройки",
  "set.currency": "Валюта",
  "set.currency.hint":
    "Валюта отображения для всего приложения. Суммы не пересчитываются — меняется только обозначение валюты.",
  "set.demo.title": "Режим демо-данных",
  "set.demo.desc": "Показывает встроенный пример, когда у вас ещё нет своих данных.",
  "set.defaultType": "Тип операции по умолчанию",
  "set.type.expense": "Расход",
  "set.type.income": "Доход",
  "set.defaultType.hint": "Выбран при открытии формы быстрого добавления.",
  // Settings: automation
  "set.automation.title": "Автоматизация",
  "set.autoMaterialize.title": "Авто-проведение регулярных",
  "set.autoMaterialize.desc": "При запуске автоматически создавать просроченные плановые платежи.",
  "set.reminders.title": "Напоминания о платежах",
  "set.reminders.desc": "Системные уведомления о платежах, которые нужно провести сегодня.",
  // Settings: appearance
  "set.appearance.title": "Внешний вид",
  "set.theme": "Тема оформления",
  "set.theme.light": "Светлая",
  "set.theme.system": "Системная",
  "set.theme.dark": "Тёмная",
  "set.density": "Плотность интерфейса",
  "set.density.comfortable": "Комфортная",
  "set.density.compact": "Компактная",
  // Settings: AI
  "set.ai.title": "ИИ-ассистент",
  "set.ai.enable.title": "Включить ИИ-ассистент",
  "set.ai.enable.desc": "Ввод операций текстом на странице «Операции» через Claude.",
  "set.ai.key": "API-ключ Anthropic",
  "set.ai.key.hint":
    "Ключ хранится только на вашем устройстве и используется для запросов к Anthropic.",
  "set.ai.model": "Модель",
  "set.ai.model.default": "По умолчанию (Opus 4.8)",
  "set.ai.model.hint":
    "Более мощные модели точнее, но дороже и медленнее. Для коротких фраз достаточно Haiku или Sonnet.",
  "set.ai.warning":
    "Текст, который вы вводите, отправляется во внешний сервис Anthropic. Не указывайте конфиденциальные данные. Функцию можно отключить в любой момент.",
  "set.ai.warning.web":
    " На сайте используется серверный ключ — если ИИ не настроен на сервере, запрос вернёт ошибку.",
  // Settings: risk
  "set.risk.title": "Риск и финансовая подушка",
  "set.risk.profile": "Риск-профиль",
  "set.risk.profile.hint":
    "Используется для анализа концентрации и риска в инвестиционном портфеле.",
  "set.risk.fund": "Цель финансовой подушки",
  "set.risk.fund.months": "{n} месяца расходов",
  "set.risk.fund.months12": "{n} месяцев расходов",
  "set.risk.fund.hint": "Рекомендуется минимум 3 месяца. 6–12 — для большей уверенности.",
  // Settings: data
  "set.data.title": "Управление данными",
  "set.data.sampleHint":
    "Демо-данные заполнят приложение примером (счета, операции, бюджеты, цели), чтобы посмотреть, как всё работает. Текущие данные при этом будут заменены.",
  "set.data.loadSample": "Загрузить демо-данные",
  "set.data.loading": "Загрузка…",
  "set.data.clearHint":
    "Очистка удалит все счета, операции, цели, бюджеты и настройки. Это действие необратимо.",
  "set.data.clear": "Очистить все данные",
  "set.data.clearConfirm": "Очистить все данные?",
  "set.data.clearConfirmDesc":
    "Все ваши операции, счета, цели, бюджеты, плановые платежи, портфель и настройки будут безвозвратно удалены. Резервную копию можно сохранить на странице Импорт.",
  "set.data.clearWarning": "Это действие нельзя отменить. Сначала сделайте резервную копию.",
  "set.data.clearing": "Очистка...",
  "set.data.clearYes": "Да, удалить всё",
  "set.toast.sampleLoaded": "Демо-данные загружены.",
  "set.toast.sampleError": "Не удалось загрузить демо-данные",
  "set.toast.cleared": "Данные очищены.",
  "set.toast.clearError": "Не удалось очистить данные",
  // Settings: about
  "set.about.shortcuts": "Горячие клавиши",
  "set.shortcut.add": "Быстро добавить операцию",
  "set.shortcut.transactions": "Перейти к операциям",
  "set.shortcut.home": "Перейти на главную",
  "set.shortcut.analytics": "Перейти к аналитике",
  "set.shortcut.help": "Показать эту справку",
  "set.about.replayOnboarding": "Показать обучение снова",
  "set.about.checkUpdates": "Проверить обновления",
  "set.about.checking": "Проверка…",
  "set.about.version": "Финансовый помощник · версия {version}",
  "set.about.security": "Безопасность и интеграции",
  "set.about.securityText1":
    "Приложение не хранит банковские логины и пароли и не выполняет screen scraping банков.",
  "set.about.securityText2":
    "Будущие банковские интеграции должны использовать официальные API, явное согласие пользователя и encrypted/secure storage для токенов.",
  "set.toast.onboardingOpened": "Обучение открыто.",
  "set.toast.onboardingError": "Не удалось открыть обучение",
  "set.update.current": "У вас актуальная версия.",
  "set.update.available": "Доступно обновление {version}",
  "set.update.downloadConfirm": "Скачать и установить сейчас? Приложение перезапустится.",
  "set.update.confirmLabel": "Обновить",
  "set.update.downloading": "Загрузка обновления…",
  "set.update.unavailable": "Автообновление недоступно — открываю страницу релизов."
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
  "error.criticalDescription": "A critical application error occurred.",
  "error.retry": "Try again",
  "notFound.title": "Page not found",
  "notFound.home": "Go home",
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
  "inv.educationTips": "Educational tips",
  // Auth marketing panel
  "auth.tagline": "Personal finance — on desktop and on the web",
  "auth.heading": "Keep your personal finances under control — without spreadsheets and chaos.",
  "auth.feature.accounts": "Accounts, transactions, transfers and bank statement imports",
  "auth.feature.budgets": "Budgets, goals, debts and scheduled payments",
  "auth.feature.forecast": "Cash-flow forecast, net worth and analytics",
  "auth.feature.privacy": "Data is isolated per account; on desktop — fully offline",
  "auth.disclaimer":
    "Free and ad-free. The investments section is educational and is not individual investment advice.",
  // Auth forms
  "auth.login.title": "Sign in",
  "auth.register.title": "Sign up",
  "auth.field.email": "Email",
  "auth.field.password": "Password",
  "auth.field.passwordMin": "Password (at least 8 characters)",
  "auth.field.name": "Name (optional)",
  "auth.submit.login": "Sign in",
  "auth.submit.loginLoading": "Signing in…",
  "auth.submit.register": "Create account",
  "auth.submit.registerLoading": "Creating…",
  "auth.noAccount": "No account?",
  "auth.haveAccount": "Already have an account?",
  "auth.toRegister": "Sign up",
  "auth.toLogin": "Sign in",
  "auth.invalidCredentials": "Invalid email or password.",
  "auth.registerFailed": "Registration failed.",
  "auth.networkError": "Network unavailable. Please try again.",
  "auth.consent.pre": "I accept the",
  "auth.consent.mid": "and consent to the processing of personal data in accordance with the",
  "legal.terms": "Terms",
  "legal.privacy": "Privacy",
  "legal.privacyPolicy": "Privacy Policy",
  // Settings: status & search
  "set.autosaveHint": "Changes are applied and saved automatically.",
  "set.saving": "Saving…",
  "set.saved": "Saved",
  "set.search": "Search settings…",
  "set.sections": "Settings sections",
  "set.nothingFound": "Nothing found for “{query}”.",
  "set.saveError": "Failed to save settings",
  // Settings: sections
  "set.section.general": "General",
  "set.section.automation": "Automation",
  "set.section.appearance": "Appearance",
  "set.section.ai": "AI assistant",
  "set.section.risk": "Risk & cushion",
  "set.section.account": "Account",
  "set.section.data": "Data",
  "set.section.about": "About",
  // Settings: general
  "set.general.title": "General settings",
  "set.currency": "Currency",
  "set.currency.hint":
    "Display currency for the whole app. Amounts are not recalculated — only the currency symbol changes.",
  "set.demo.title": "Demo data mode",
  "set.demo.desc": "Shows a built-in example when you don't have your own data yet.",
  "set.defaultType": "Default transaction type",
  "set.type.expense": "Expense",
  "set.type.income": "Income",
  "set.defaultType.hint": "Pre-selected when the quick-add form opens.",
  // Settings: automation
  "set.automation.title": "Automation",
  "set.autoMaterialize.title": "Auto-post recurring",
  "set.autoMaterialize.desc": "On startup, automatically create overdue scheduled payments.",
  "set.reminders.title": "Payment reminders",
  "set.reminders.desc": "System notifications for payments due today.",
  // Settings: appearance
  "set.appearance.title": "Appearance",
  "set.theme": "Theme",
  "set.theme.light": "Light",
  "set.theme.system": "System",
  "set.theme.dark": "Dark",
  "set.density": "Interface density",
  "set.density.comfortable": "Comfortable",
  "set.density.compact": "Compact",
  // Settings: AI
  "set.ai.title": "AI assistant",
  "set.ai.enable.title": "Enable AI assistant",
  "set.ai.enable.desc": "Enter transactions as text on the Transactions page via Claude.",
  "set.ai.key": "Anthropic API key",
  "set.ai.key.hint": "The key is stored only on your device and used for requests to Anthropic.",
  "set.ai.model": "Model",
  "set.ai.model.default": "Default (Opus 4.8)",
  "set.ai.model.hint":
    "More powerful models are more accurate but pricier and slower. Haiku or Sonnet is enough for short phrases.",
  "set.ai.warning":
    "The text you enter is sent to the external Anthropic service. Do not include confidential data. You can disable this feature at any time.",
  "set.ai.warning.web":
    " On the website a server key is used — if AI is not configured on the server, the request will return an error.",
  // Settings: risk
  "set.risk.title": "Risk & emergency fund",
  "set.risk.profile": "Risk profile",
  "set.risk.profile.hint": "Used to analyze concentration and risk in the investment portfolio.",
  "set.risk.fund": "Emergency fund target",
  "set.risk.fund.months": "{n} months of expenses",
  "set.risk.fund.months12": "{n} months of expenses",
  "set.risk.fund.hint": "At least 3 months is recommended. 6–12 for more confidence.",
  // Settings: data
  "set.data.title": "Data management",
  "set.data.sampleHint":
    "Demo data fills the app with an example (accounts, transactions, budgets, goals) so you can see how everything works. Your current data will be replaced.",
  "set.data.loadSample": "Load demo data",
  "set.data.loading": "Loading…",
  "set.data.clearHint":
    "Clearing deletes all accounts, transactions, goals, budgets and settings. This action is irreversible.",
  "set.data.clear": "Clear all data",
  "set.data.clearConfirm": "Clear all data?",
  "set.data.clearConfirmDesc":
    "All your transactions, accounts, goals, budgets, scheduled payments, portfolio and settings will be permanently deleted. You can save a backup on the Import page.",
  "set.data.clearWarning": "This action cannot be undone. Make a backup first.",
  "set.data.clearing": "Clearing...",
  "set.data.clearYes": "Yes, delete everything",
  "set.toast.sampleLoaded": "Demo data loaded.",
  "set.toast.sampleError": "Failed to load demo data",
  "set.toast.cleared": "Data cleared.",
  "set.toast.clearError": "Failed to clear data",
  // Settings: about
  "set.about.shortcuts": "Keyboard shortcuts",
  "set.shortcut.add": "Quick-add a transaction",
  "set.shortcut.transactions": "Go to transactions",
  "set.shortcut.home": "Go to home",
  "set.shortcut.analytics": "Go to analytics",
  "set.shortcut.help": "Show this help",
  "set.about.replayOnboarding": "Show the tutorial again",
  "set.about.checkUpdates": "Check for updates",
  "set.about.checking": "Checking…",
  "set.about.version": "Financial Assistant · version {version}",
  "set.about.security": "Security & integrations",
  "set.about.securityText1":
    "The app does not store bank logins or passwords and does not perform bank screen scraping.",
  "set.about.securityText2":
    "Future bank integrations must use official APIs, explicit user consent and encrypted/secure storage for tokens.",
  "set.toast.onboardingOpened": "Tutorial opened.",
  "set.toast.onboardingError": "Failed to open the tutorial",
  "set.update.current": "You have the latest version.",
  "set.update.available": "Update {version} available",
  "set.update.downloadConfirm": "Download and install now? The app will restart.",
  "set.update.confirmLabel": "Update",
  "set.update.downloading": "Downloading update…",
  "set.update.unavailable": "Auto-update unavailable — opening the releases page."
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
