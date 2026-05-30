# Финансовый помощник

Production-ready MVP для ручного учета личных финансов, бюджета, целей накоплений и аналитики российского фондового рынка.

Инвестиционный раздел показывает аналитику, риски, структуру портфеля и образовательные подсказки. Он не дает индивидуальных инвестиционных рекомендаций.

## Features

### Implemented

- Учет доходов и расходов с поддержкой счетов, категорий и переводов между счетами.
- Управление категориями: создание, редактирование, удаление, защита от удаления категорий с операциями.
- Бюджеты по категориям: лимиты, прогресс, сброс лимита до нуля.
- Цели накоплений: создание, редактирование, удаление с подтверждением, пополнение цели с прогрессом.
- Плановые платежи и доходы: шаблоны с частотой еженедельно/ежемесячно/ежегодно, материализация наступивших платежей.
- Прогноз cashflow на 30 и 90 дней с предупреждениями о кассовых разрывах.
- Аналитика за 6 месяцев: помесячный cashflow, топ категорий расходов, коэффициент сбережений.
- Инвестиции: портфель, watchlist, аналитика рисков, образовательные подсказки.
- Импорт CSV с маппингом колонок, экспорт операций в CSV и JSON, полный backup и восстановление.
- Быстрое добавление операции (Quick Add FAB) с форм-панелью на мобильном экране.
- PWA: manifest, service worker, offline.html, mobile-first layout, нижняя мобильная навигация.

### Roadmap

- Подключение MOEX ISS API вместо mock-данных по ценным бумагам.
- Банковские интеграции через официальные API с согласия пользователя.
- SQLite/IndexedDB синхронизация между desktop-устройствами.
- Уведомления о приближающихся плановых платежах и превышении бюджетных лимитов.

## Stack

- Next.js 16, React 18, TypeScript 5
- Tailwind CSS, shadcn/ui-style components
- Prisma ORM, PostgreSQL
- Recharts, Zod, date-fns
- PWA-ready настройки
- Архитектурная подготовка под Capacitor Android и Tauri Windows

## Quick Start

```bash
npm install
copy .env.example .env
npm run docker:db:up
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

Если `DATABASE_URL` не задан или база недоступна, UI покажет встроенный demo fallback, но сохранение форм требует PostgreSQL и seed.

## Local PostgreSQL With Docker

Для воспроизводимого локального окружения добавлен `docker-compose.yml`:

```bash
npm run docker:db:up
npm run db:migrate
npm run db:seed
```

Полезные команды:

```bash
npm run docker:db:logs
npm run docker:db:down
npm run db:studio
```

Локальный `.env` не коммитится. Для разработки можно оставить дефолтные значения из `.env.example` или заменить пароль PostgreSQL на свой.

## Environment Modes

```env
NEXT_PUBLIC_APP_PLATFORM=web       # web | android | desktop
NEXT_PUBLIC_APP_ENV=development    # development | production
NEXT_PUBLIC_API_MODE=cloud         # cloud | local | mock
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_DESKTOP_DATA_MODE=cloud # cloud | local
NEXT_OUTPUT=
```

Web-версия может работать с backend API и PostgreSQL на сервере. Desktop-версия подготовлена к двум режимам:

- `cloud`: Tauri-приложение работает как клиент к удаленному API.
- `local`: данные хранятся локально через storage adapter; SQLite/IndexedDB синхронизация с сервером оставлена как TODO.

## Architecture

- UI находится в `app/` и `components/`.
- Бизнес-логика вынесена в `services/`.
- Prisma и серверное чтение данных находятся в `lib/data.ts` и `lib/actions.ts`.
- REST-style endpoints находятся в `app/api/`.
- Все сетевые запросы для переносимого frontend идут через `lib/api/ApiClient.ts`.
- Доступ к localStorage, IndexedDB и desktop file system вынесен в `lib/storage/` и `lib/files/`.
- `lib/repositories/` позволяет переключать источник данных между API и local mode.

Frontend не использует Node.js API напрямую. Browser-only API изолированы в client adapters.

## PWA

Добавлены:

- `public/manifest.json`
- `public/sw.js`
- `public/offline.html`
- app icons в `public/icons/`
- `theme-color`
- mobile-first layout и нижняя мобильная навигация
- мобильные карточки вместо таблиц на малых экранах

Production service worker регистрируется автоматически после `npm run build && npm run start`.

## Mobile Build With Capacitor

Установленные зависимости: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`.

```bash
npm run build:static
npx cap add android
npm run cap:sync
npm run cap:android
```

Для APK используйте Android Studio или Gradle в папке `android/`, например `gradlew assembleDebug`.

Для mobile shell обычно используйте:

```env
NEXT_PUBLIC_APP_PLATFORM=android
NEXT_PUBLIC_API_MODE=cloud
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com/api
NEXT_OUTPUT=export
```

## Desktop Build With Tauri

Структура Tauri уже добавлена:

- `src-tauri/`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Команды:

```bash
npm install --save-dev @tauri-apps/cli
npm create tauri-app
```

Или настройка Tauri в существующем проекте:

```bash
npm install --save-dev @tauri-apps/cli
npm install @tauri-apps/api
```

Запуск desktop-версии:

```bash
npm run tauri dev
```

Также доступна короткая команда:

```bash
npm run tauri:dev
```

Сборка Windows EXE:

```bash
npm run tauri build
```

Также доступна:

```bash
npm run tauri:build
```

Результат сборки:

```text
src-tauri/target/release/bundle/
```

Desktop-версия использует тот же frontend. В `cloud` режиме она подключается к API, в `local` режиме предусмотрены `DesktopStorageAdapter` и `TauriFileSystemAdapter`.

Подробная инструкция по Windows EXE находится в [docs/WINDOWS_DESKTOP.md](docs/WINDOWS_DESKTOP.md). Быстрая проверка окружения:

```bash
npm run build:static
npm run desktop:preflight
```

## Import And Export

Страница `Import` поддерживает:

- выбор CSV;
- предпросмотр строк;
- маппинг колонок даты, суммы, описания, категории и счета;
- импорт операций;
- экспорт операций в CSV и JSON;
- полный JSON backup пользовательских данных;
- восстановление из JSON backup.

Backup v1 включает настройки, счета, категории, операции, плановые операции, бюджеты, цели, портфель и watchlist. Web использует browser file adapter. Desktop-режим подготовлен для Tauri file plugins.

## Planned Payments

Страница `Плановые платежи` поддерживает:

- шаблоны повторяющихся доходов и расходов;
- периоды `еженедельно`, `ежемесячно`, `ежегодно`;
- ближайшие обязательства и сумму на 7 дней;
- расчет планового месячного денежного потока;
- создание наступивших операций из шаблона с автоматическим переносом следующей даты.

## Cashflow Forecast

Страница `Прогноз` строит плановый cashflow на 30 и 90 дней:

- доступный остаток с учетом наличных, дебетовых карт и накопительных счетов;
- регулярные доходы и расходы из плановых операций;
- ближайшие события календаря;
- предупреждения о возможном кассовом разрыве;
- контроль нагрузки целей накоплений на свободный поток.

В настройках есть блок локального снимка данных для desktop/mobile local mode. Он сохраняет текущие API-данные в IndexedDB через `StorageAdapter`, без прямого использования Node.js API во frontend.

## Market Data

MVP использует `MockMarketDataProvider` с демо-данными по:

`SBER`, `GAZP`, `LKOH`, `YNDX`, `T`, `VTBR`, `MGNT`, `NVTK`, `ROSN`, `MOEX`.

`MoexMarketDataProvider.ts` содержит TODO для будущего подключения MOEX ISS API.

## Security Notes

- Банковские логины и пароли не хранятся.
- Screen scraping банков не используется.
- Банковские API требуют официального доступа и явного согласия пользователя.
- Для будущих токенов нужна secure storage / keychain модель и шифрование at rest.
- В MVP банковские токены не реализованы.

## Useful Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run test
npm run db:migrate
npm run db:seed
npm run db:studio
```

## DevOps Workflow

GitHub Actions workflow находится в `.github/workflows/ci.yml` и запускает:

- `npm ci`
- `npx prisma generate`
- PostgreSQL service container
- `npm run db:deploy`
- `npm run db:seed`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run build:static`

Практика работы: важные этапы фиксируются отдельными git-коммитами, чтобы можно было быстро откатиться к стабильному состоянию.

Перед релизом используйте [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md): там собраны preflight, проверки web/PWA, Android shell и Windows desktop shell.
