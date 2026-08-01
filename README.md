<div align="center">

# 💰 Финансовый помощник

### Личные финансы, бюджеты, цели и аналитика рынка — на компьютере и на телефоне, полностью офлайн

[![CI](https://github.com/Lucky2356/financeapps/actions/workflows/ci.yml/badge.svg)](https://github.com/Lucky2356/financeapps/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![Tests](https://img.shields.io/badge/tests-379%20passing-success)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20Android-blue)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&logoColor=white)](https://tauri.app/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

[Возможности](#-возможности) · [Архитектура](#-архитектура) · [Быстрый старт](#-быстрый-старт) · [Windows](#-windows) · [Android](#-android) · [Вклад](CONTRIBUTING.md)

</div>

---

**Финансовый помощник** — приложение для учёта личных финансов, которое работает **только на вашем
устройстве**. Ни сервера, ни аккаунта, ни облака: все данные лежат в локальном хранилище (IndexedDB)
того устройства, где вы их ввели.

- 🖥️ **Windows** — установщик NSIS, авто-обновление через GitHub Releases.
- 📱 **Android** — APK с тем же интерфейсом и теми же функциями.
- 🔄 **Перенос данных** между устройствами — файлом резервной копии (выгрузить → перенести →
  восстановить), см. [docs/ANDROID.md](docs/ANDROID.md).

> **Дисклеймер.** Инвестиционный раздел показывает аналитику, риски и образовательные подсказки и **не** является индивидуальной инвестиционной рекомендацией.

---

## ✨ Возможности

| Раздел | Что умеет |
|---|---|
| **Операции** | Доходы, расходы, переводы между счетами; поиск, фильтры, пагинация |
| **Счета** | Несколько счетов (наличные, карта, накопительный, брокерский) с балансами |
| **Категории** | Цвет, флаги «обязательная»/«подписка», защита от удаления категории с операциями |
| **Бюджеты** | Лимиты по категориям, прогресс, предупреждение при превышении |
| **Цели** | Создание, пополнение, расчёт нужного ежемесячного взноса |
| **Плановые платежи** | Шаблоны (неделя/месяц/год) с авто-проведением наступивших операций |
| **Долги** | Кредиты/займы, влияние на net worth, стратегии погашения (лавина/снежок) |
| **Прогноз** | Денежный поток на 30/90 дней с предупреждением о кассовых разрывах |
| **Аналитика** | Динамика, топ категорий, норма сбережений |
| **Отчёты** | Сводный отчёт с печатью/экспортом в PDF |
| **Инвестиции** | Портфель, watchlist, анализ рисков, структура по секторам (данные MOEX ISS) |
| **Капитал** | Net worth с **реальными снимками во времени** (не только реконструкция) |
| **Дашборд** | Финансовый health-score по факторам, метрики, графики |
| **Импорт/экспорт** | CSV с **авто-определением банка** (Сбер/Т-Банк/Альфа/ВТБ), экспорт CSV/JSON, полный backup |
| **🤖 ИИ-ассистент** | Ввод операции текстом через Claude/OpenAI/DeepSeek (opt-in, ключ пользователя) |

Дополнительно: мультивалюта, тёмная/светлая тема, плотность интерфейса, горячие клавиши (с русской раскладкой).

---

## 🏗️ Архитектура

Один фронтенд — статический экспорт Next.js — и один источник данных: `LocalApiClient` поверх
IndexedDB. Windows и Android запускают **один и тот же бандл** в оболочке Tauri 2, поэтому набор
функций на телефоне и на компьютере совпадает полностью.

```mermaid
flowchart TD
    UI["React UI · Next.js App Router (static export)"] --> LOCAL["LocalApiClient"]
    LOCAL --> IDB[("IndexedDB · на устройстве")]

    subgraph WIN ["🖥️ Windows · Tauri 2"]
        UPD["Updater · GitHub Releases"]
    end

    subgraph AND ["📱 Android · Tauri 2"]
        APK["APK · установка вручную"]
    end

    BACKUP["Резервная копия .json"] -. "перенос между устройствами" .- IDB
    AI["ИИ: Claude / OpenAI / DeepSeek (opt-in, ключ пользователя)"] -. -. LOCAL
```

Серверной части нет: нет базы данных, нет аккаунтов, нет API-роутов. Страницы отдаются пустыми, а
реальные цифры подставляет клиент из хранилища устройства.

---

## 🚀 Быстрый старт

```bash
git clone https://github.com/Lucky2356/financeapps.git
cd financeapps
npm install
npm run dev                     # http://localhost:3000
```

`npm run dev` открывает то же приложение в браузере — с теми же локальными данными в IndexedDB.
Нативные диалоги файлов там недоступны, вместо них используется обычная загрузка/выгрузка.

---

## 🖥️ Windows

Требуется Rust toolchain (подробно — [docs/WINDOWS_DESKTOP.md](docs/WINDOWS_DESKTOP.md)).

```bash
npm run tauri:build     # собрать установщик NSIS
npm run tauri:dev       # запустить в режиме разработки
```

Готовые установщики — на странице [**Releases**](https://github.com/Lucky2356/financeapps/releases). Инструкция для пользователей: [docs/УСТАНОВКА.md](docs/УСТАНОВКА.md). Авто-обновление и подпись описаны в [docs/DESKTOP_UPDATES.md](docs/DESKTOP_UPDATES.md).

---

## 📱 Android

Требуется Android SDK + NDK + JDK 17 (подробно, вместе с ключом подписи — [docs/ANDROID.md](docs/ANDROID.md)).

```bash
npm run android:build         # релизный APK (нужен keystore)
npm run android:build:debug   # отладочный APK, ставится без своего ключа
npm run android:dev           # запуск на подключённом устройстве
```

APK лежит в релизах рядом с установщиком для Windows. Авто-обновления на Android нет — новая версия
ставится APK поверх старой.

---

## 🧱 Технологии

- **Frontend:** Next.js 16 (App Router, статический экспорт), React 19, TypeScript 5, Tailwind CSS, Radix UI, Recharts
- **Оболочка:** Tauri 2 (Windows + Android), плагины fs/dialog/http/opener/process, updater и window-state — только на десктопе
- **Хранилище:** IndexedDB на устройстве, миграции состояния в `lib/storage/migrations`
- **AI:** Anthropic Claude / OpenAI / DeepSeek, opt-in, ключ пользователя
- **Качество:** Vitest + Testing Library, Playwright (E2E), ESLint, Prettier, Husky + lint-staged
- **Инфра:** GitHub Actions (CI + релизы)
- **Валидация/утилиты:** Zod, date-fns, PapaParse

---

## 📁 Структура проекта

```text
app/                # страницы (App Router), статический экспорт
components/         # UI; *-manager.tsx — клиентские обёртки над LocalApiClient
hooks/              # useApiPageData и пр.
lib/
  api/              # LocalApiClient — единственный источник данных
  data.ts           # типы данных страниц + пустые заглушки для серверной оболочки
  storage/          # адаптеры IndexedDB и миграции состояния
  net-worth*.ts     # расчёт капитала и снимки во времени
services/           # бизнес-логика: прогноз, рекомендации, импорт, рыночные данные, AI
src-tauri/          # оболочка Tauri: Rust, capabilities, gen/android — gradle-проект
tests/              # модульные тесты (Vitest)
e2e/                # Playwright
docs/               # десктоп, Android, релизы, установка
```

---

## 🛠️ Команды

| Команда | Назначение |
|---|---|
| `npm run dev` | Дев-сервер в браузере |
| `npm run build:static` | Статический экспорт (общий бандл для обеих оболочек) |
| `npm run typecheck` · `lint` | Типы (`tsc --noEmit`) · ESLint (0 предупреждений) |
| `npm run test` · `test:coverage` | Модульные тесты · покрытие |
| `npm run test:e2e` | Playwright E2E |
| `npm run tauri:build` · `tauri:dev` | Windows: сборка · запуск |
| `npm run android:build` · `android:build:debug` · `android:dev` | Android: релизный APK · отладочный APK · запуск |

---

## ✅ Качество

- **379** модульных тестов (Vitest) + E2E (Playwright)
- Пороги покрытия в CI; гейты: `typecheck`, `lint`, `test`, `build:static`
- Pre-commit хук (Husky + lint-staged): ESLint + Prettier + связанные тесты
- Строгая типизация (без `as any`), валидация ввода через Zod

---

## 🔐 Безопасность и приватность

- Данные не покидают устройство: ни сервера, ни аккаунта, ни синхронизации через облако.
- Перенос между устройствами делает сам владелец — файлом резервной копии.
- ИИ-ассистент **выключен по умолчанию**; при включении отправляет минимальный срез во внешний сервис с явным предупреждением, по ключу самого пользователя.
- Банковские логины/скрейпинг **не** используются. Рыночные данные — публичный MOEX ISS.
- Уязвимости — см. [SECURITY.md](SECURITY.md).

---

## 🗺️ Дорожная карта

- [x] Мультивалюта, долги и стратегии погашения, подписки, отчёты/PDF
- [x] ИИ-ассистент (Claude/OpenAI/DeepSeek, opt-in)
- [x] Снимки капитала во времени
- [x] Планирование отдельно от учёта; бюджеты и долги в плановых
- [x] Android-версия с переносом данных с ПК и обратно
- [ ] Быстрый обмен резервной копией между устройствами (без ручного переноса файла)
- [ ] Семейный/общий доступ к бюджету

---

## 🤝 Вклад в проект

PR и issue приветствуются! Перед началом см. [CONTRIBUTING.md](CONTRIBUTING.md) и [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Шаблоны: [баг-репорт](.github/ISSUE_TEMPLATE/bug_report.yml), [предложение фичи](.github/ISSUE_TEMPLATE/feature_request.yml).

## 📜 Лицензия

[MIT](LICENSE) © 2026 Lucky2356 и контрибьюторы. Программа поставляется «как есть»; инвестиционный раздел не является индивидуальной рекомендацией.
