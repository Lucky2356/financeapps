# Changelog

All notable changes to this project are documented in this file.

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
