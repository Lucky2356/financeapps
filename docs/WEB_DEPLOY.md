# Развёртывание веб-версии на VPS (Docker)

Поднимает сайт (Next.js + PostgreSQL) в Docker. Доступ по `http://<ip-сервера>:3000`.
Подходит для проверки работоспособности; для боевой нагрузки см. оговорки в конце.

## Требования
- Docker + Docker Compose plugin на сервере.
- **≥ 2 ГБ RAM** для сборки образа (Next build тяжёлый). На слабом сервере либо
  добавьте swap, либо собирайте образ в CI и подтягивайте готовый (см. ниже).

## Шаги (на сервере)

```bash
# 1. Установить Docker (если ещё нет)
curl -fsSL https://get.docker.com | sh

# 2. Получить код
git clone https://github.com/Lucky2356/financeapps.git
cd financeapps

# 3. Создать .env из шаблона и заполнить
cp .env.docker.example .env
#   - POSTGRES_PASSWORD — надёжный пароль
#   - AUTH_SECRET — сгенерировать:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#     (вставить вывод в AUTH_SECRET в .env)
#   - ANTHROPIC_API_KEY — по желанию (для AI на сайте)
nano .env

# 4. Открыть порт в фаерволе
sudo ufw allow 3000

# 5. Собрать и запустить (миграции БД применятся автоматически)
docker compose up -d --build
```

Открыть в браузере: **http://130.49.213.234:3000** → «Зарегистрироваться» → войти.

## Управление

```bash
docker compose logs -f web      # логи приложения
docker compose ps               # статус контейнеров
docker compose down             # остановить (данные БД сохраняются в volume)

# Обновление после изменений в репозитории:
git pull
docker compose up -d --build    # пересобрать и перезапустить (миграции применятся)
```

## Вариант Б: готовый образ из GHCR (рекомендуется для слабого сервера)

Не собирать Next на VPS, а подтянуть готовый образ, собранный в GitHub Actions.

1. **Собрать образ в CI:** GitHub → Actions → **Build & Push Web Image** → Run
   workflow. Он публикует `ghcr.io/lucky2356/financeapps-web` и `-migrate`.
2. **Открыть доступ к образам:** на GitHub в Packages у обоих пакетов поставить
   видимость Public (проще всего), либо на сервере `docker login ghcr.io` под PAT
   с правом `read:packages`.
3. **На сервере:**
   ```bash
   cd financeapps && git pull          # нужен только .env и compose-файл
   cp .env.docker.example .env && nano .env   # как в шаге 3 выше
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```
   Сборка на сервере не выполняется — только загрузка образов.

## Как это устроено
- `postgres` — БД (только во внутренней сети, наружу не открыта).
- `migrate` — одноразово применяет `prisma migrate deploy` и завершается.
- `web` — Next.js (standalone), слушает 3000. `AUTH_TRUST_HOST=true`, чтобы Auth.js
  принимал доступ по IP.

## Оговорки (это «проверочный», не боевой контур)
- **HTTP без шифрования.** Пароли/сессии идут в открытом виде. Для реального
  использования нужен домен + HTTPS (Caddy/Nginx + Let's Encrypt) — тогда трафик
  шифруется, а cookies станут `Secure`.
- **152-ФЗ:** для российских пользователей ПДн должны храниться на сервере в РФ.
- **Слабый сервер:** один инстанс, in-memory rate-limit, без пулинга/реплик —
  это фаза P0/проверка. Масштаб (PgBouncer, реплики, кеш, CDN) — фазы P1/P2.
- Если сервер не тянет сборку — соберите образ в GitHub Actions и подтяните
  готовый (могу добавить workflow для GHCR по запросу).
