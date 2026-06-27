# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.0.7] — 2026-06-27

📈 Переделан раздел «Инвестиции» — стало удобнее.

### Изменено
- **Раздел «Инвестиции» переработан под брокерский вид.** Вместо одной длинной
  прокрутки — **вкладки**: Портфель / Список наблюдения / Аналитика / Подбор.
- **Сводка портфеля — всегда сверху:** стоимость, изменение за день (в ₽ и %),
  вложено, общий P/L и доходность. Сразу видно главное, без прокрутки.
- **Графики цены открываются понятно:** клик по любой строке (в портфеле или в
  списке наблюдения) **разворачивает график прямо под ней** — без всплывающих окон.
  Переключатели периода (1М/3М/6М/1Г/5Л) на месте.

## [1.0.6] — 2026-06-27

🛠 Релиз с исправлениями: чинит автообновление desktop и цену акций.

### Исправлено
- **Автообновление (desktop).** Установщик в релизе назывался кириллицей
  («Финансовый помощник_…-setup.exe»), а GitHub вырезает не-ASCII символы из имён
  ассетов — из-за чего ссылка в манифесте обновления вела на 404, и установка
  срывалась («невозможно обновить»). Теперь установщик публикуется с ASCII-именем,
  и манифест всегда совпадает с ассетом. Манифест уже вышедшего 1.0.5 тоже исправлен,
  так что обновление с 1.0.4 заработает без переустановки.
- **Цена акций в инвестициях.** Вне торговой сессии показывалась средневзвешенная
  цена MOEX (например, ~296 ₽ у Сбербанка) вместо реальной цены закрытия (299,18 ₽).
  Теперь приоритет такой: цена последней сделки (в течение дня) → официальная цена
  закрытия → средневзвешенная только как крайний случай. Дневное изменение вне сессии
  тоже считается по ценам закрытия, а не показывает 0%.

### Добавлено
- **Открытие страницы релизов на desktop.** Если автообновление всё же не удалось,
  кнопка теперь действительно открывает страницу релизов в системном браузере
  (плагин opener) — раньше webview блокировал переход, и не происходило ничего.
  Причина ошибки обновления теперь пишется в лог для диагностики.

## [1.0.5] — 2026-06-27

🌍 **The app is now fully bilingual (RU/EN)** and the investments screen works on
real market data. This release also closes a round of security hardening ahead of
a public deployment.

### Added
- **Full English localization.** The entire product — navigation, every screen,
  forms, errors, and *generated* content (recommendations, insights, forecast
  warnings, investment analysis, goal pacing, health summary) — now switches
  between Russian and English. Toggle the language in Settings.
- **Investments on real data.** Live MOEX quotes, search for any Russian security,
  click a holding to open its historical price chart, and a portfolio summary with
  per-position profit/loss.
- **Budget rollover.** An unspent budget can carry its remainder into the next month.
- **Inline create** of an account or category directly from the transaction form —
  no need to leave the screen.

### Changed
- **Responsive width.** Content now stretches to fill the screen on large displays,
  with a tidier field grid in Settings (better use of 24″+ monitors).

### Security
- **Backup endpoint locked down.** `/api/backup` now requires authentication and is
  scoped to the signed-in user (previously it exposed/overwrote the first user's
  full data with no auth).
- **HTTPS-only by default.** The web container is no longer published on the host —
  all traffic goes through the TLS reverse proxy. `POSTGRES_PASSWORD` is now required.
- **Content-Security-Policy** added for the web app; Sentry now scrubs PII before
  sending; API errors no longer leak internal messages to clients.
- CSV import is size/row-bounded (DoS protection); CSV export escapes spreadsheet
  formulas; login is throttled per account; nightly DB backups can be encrypted at
  rest. The AI key is no longer persisted server-side on the web.

### Fixed
- Budget calculation corrections from a full finance/accounting audit of the math.

## [1.0.4] — 2026-06-25

### Changed
- **Settings redesigned**: a long single-scroll page became a sectioned layout
  with a left section nav (top scrollable tabs on mobile), a settings search, and
  larger touch targets. Account, data-management and "about" are folded in; the
  desktop-only local-mode panel and confusing copy were cleaned up.

### Fixed
- **Desktop auto-update**: diagnosed why v1.0.2 → v1.0.3 failed — the updater
  signing key was rotated between those releases, so v1.0.2 (which has the old
  public key baked in) can't verify v1.0.3's signature. This can't be repaired
  retroactively (install the new version manually once). The key is now pinned by
  a guard test, and the release workflow cryptographically verifies the build's
  signature against the baked public key before publishing — so a build that
  installed clients can't verify is never released. The displayed version now
  comes from package.json (was a stale hardcoded "1.0.2").
- No console errors / spurious Sentry reports on public pages (login/register):
  the data layer no longer logs the expected "no session" state, and the
  automation runner no longer calls authenticated endpoints there.
- Onboarding dialog no longer pops over the registration form; its welcome copy
  is now correct for the web (account-based, not "data on this device").
- Settings showed version 1.0.2 — the displayed version is now sourced from
  package.json (`NEXT_PUBLIC_APP_VERSION`) and can't go stale.
- The desktop "local mode" snapshot panel is hidden on the web app.

### Added
- Account self-service (web): change password in-session
  (`POST /api/account/password`) and delete account with all data
  (`DELETE /api/account`, 152-ФЗ right to erasure), both confirmed by password.
- Explicit consent checkbox at registration (active consent to Terms & Privacy).
- Product "front door": a value-proposition panel next to the login/register
  form on large screens.

### Security
- Login attempts are rate-limited per IP (brute-force / credential-stuffing).
- `Strict-Transport-Security` (HSTS) header for HTTPS deployments.

### SEO / PWA
- OpenGraph metadata, keywords, and `robots.txt`.
- PNG app icons (favicon, apple-touch, 192/512 + maskable) alongside SVG.

### CI
- GitHub Actions upgraded to current majors (resolves Node 20 deprecation).

## [1.0.3] — 2026-06-24

### Added
- Web parity with desktop:
  - Auto-categorization rules on the web (`Rule` model, `/api/rules`); rules are
    applied on CSV import and take priority over the history-based suggestion.
  - Batch auto-posting of all due recurring payments on the web
    (`/api/recurring/materialize-all`); the "auto-post recurring" setting now
    works in both modes.
  - Undo last CSV import on the web (`importBatchId`, `/api/import/undo`) with
    account-balance rollback.
- Dashboard: net-worth breakdown by component (accounts / investments / goals / debts).
- Command palette: search individual transactions by description.
- Empty state: "Load demo data" button in the setup checklist when there are no
  accounts or transactions yet.
- Internationalization: lightweight RU/EN layer with a language switcher in
  Settings; navigation and the error screen are translated (incremental, falls
  back to Russian).

### Changed
- Performance: charts (Recharts) are lazy-loaded via `next/dynamic`, removing the
  heavy charting bundle from the initial load.
- UX: skeleton loaders instead of spinners on key pages; budget overrun is
  highlighted directly on the card.

### Accessibility
- Text alternatives (`role="img"` + `aria-label`) for all charts.

### Deferred (v1.0.4)
- Email password reset (needs SMTP) and OAuth providers.
- Full content-string translation; AI-prompt language on the server path.
- Budget rollover; custom domain and trusted TLS certificate.

## [1.0.1] — 2026-06-21

### Added
- Configurable display currency (RUB/USD/EUR/GBP/CNY/KZT) in Settings.
- Goal cards show pacing context (months left / reached / overdue).
- Finance health score now lists the factors that cost points.
- CSV import detects and can skip duplicate rows.
- Forecast events can be filtered by account and category.
- Backup safety improvements: local schema v2, last-backup reminder, restore preview before replacing data.
- CSV import presets for Sber, T-Bank, Alfa-Bank, and VTB column layouts.
- Analytics insights: savings-rate trend, month-over-month expense change, and short actionable notes.
- Expanded MOEX watchlist universe with additional liquid Russian equities.
- Coverage thresholds, Prettier, husky pre-commit, and Playwright E2E for the desktop build.
- Settings action to replay onboarding after the first launch.

### Changed
- Destructive confirmations (delete goal/profile, reset budget limit) use a styled dialog instead of the browser prompt.
- Mobile secondary-navigation tap targets enlarged to ~44px.
- Faster desktop reads: the parsed local state is cached per profile.
- Onboarding footer now adapts on narrow screens without buttons overflowing the dialog.
- Finance hints now render in a body-level portal, stay inside the viewport, and are not clipped by cards.
- Chart tooltips can escape chart bounds near edges instead of disappearing inside the plot area.
- Web production builds now avoid request-only `connection()` hangs and skip live DB reads during build-time fallback generation.
- Docker build target uses Node 24 and explicit standalone Next.js output settings.

### Fixed
- Recurring transactions created without an explicit active flag now default to active.

## [1.0.0] — 2026-05-30

### Added
- Full CRUD for personal finance: transactions, accounts, categories, budgets, goals, recurring payments
- Category management with color picker, isEssential and isSubscription flags
- 90-day cashflow forecast with upcoming event calendar and cash-flow gap warnings
- Investment portfolio tracker: watchlist, P/L, sector structure, risk analysis
- Analytics dashboard: 6-month income/expense trends, savings rate, top spending categories
- Quick Add FAB for fast transaction entry on mobile and desktop
- Dashboard financial health score (0–100) with monthly trend badges
- Goal deposit action ("Пополнить") with current amount tracking
- Budget monthly history: view spending for previous months
- CSV import with column mapping and duplicate detection; export to CSV and JSON
- Full JSON backup and restore; import undo (desktop local mode)
- PWA: manifest, service worker, offline page, mobile-first layout
- Tauri Windows desktop app: offline local mode, NSIS installer
- Capacitor Android build configuration
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Custom 404 and error boundary pages
- Per-route loading states
- Keyboard shortcuts (Alt+N, Alt+T, Alt+D, Alt+A, ?)
- Print/PDF support for analytics page
- MOEX ISS API integration for live Russian stock prices

### Technical
- Next.js 16 App Router, TypeScript strict mode
- Prisma ORM with PostgreSQL; demo fallback for no-DB environments
- LocalApiClient for full offline functionality (no server required)
- 9 test files, 40+ tests covering financial calculations, CSV parsing, API client

## [0.1.0] — 2026-05-27

### Added
- Initial MVP release
