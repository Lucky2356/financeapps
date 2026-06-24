# Changelog

All notable changes to this project are documented in this file.

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
