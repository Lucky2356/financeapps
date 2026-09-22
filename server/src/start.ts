// Запуск службы: прочитать настройки, поднять, аккуратно опуститься.
//
// Настройки — через окружение, потому что так их задаёт systemd и так они не
// попадают в git:
//   FINANCE_DB          путь к базе (по умолчанию ./finance.db)
//   FINANCE_PORT        порт (по умолчанию 8787)
//   FINANCE_ADMIN_TOKEN пропуск к страницам управления; пусто — выключено
//   FINANCE_ORIGIN      кому отвечать; по умолчанию всем
//   FINANCE_MAX_SLOTS   сколько книг на человека; пусто — без предела
//   FINANCE_MAX_MB      сколько всего мегабайт на человека; пусто — без предела
//   FINANCE_OPEN_REGISTRATION=1  пускать без приглашения; пусто — только по нему
//   FINANCE_PUBLIC_URL  каким адресом служба зовётся снаружи; нужен коду связки
//
// Слушаем только 127.0.0.1: наружу служба смотрит через Caddy, который и держит
// TLS. Открой она порт всему свету — к ней можно было бы прийти по HTTP в обход
// сертификата, и билет уехал бы открытым текстом.

import { createApp } from "./main.ts";

const DB_PATH = process.env.FINANCE_DB ?? "./finance.db";
const PORT = Number(process.env.FINANCE_PORT ?? 8787);

/**
 * Предел из окружения — или его отсутствие.
 *
 * Незаданная переменная и заданная мусором — разные вещи, и обходиться с ними
 * одинаково нельзя. Незаданная значит «не считать»: так служба вела себя всегда
 * и так она обязана вести себя дальше у всех, кто уже её поднял. А вот
 * `FINANCE_MAX_MB=сто` — это опечатка хозяина, и молча превратить её в «без
 * предела» значит оставить службу открытой ровно там, где её просили закрыть.
 * Поэтому мусор роняет запуск: заметить это в момент `systemctl restart` можно,
 * а через месяц по кончившемуся диску — уже нет.
 */
function limit(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name}=${raw} — это не положительное число. Уберите переменную или поправьте.`);
    process.exit(1);
  }
  return value;
}

const MAX_SLOTS = limit("FINANCE_MAX_SLOTS");
const MAX_MB = limit("FINANCE_MAX_MB");

const app = createApp({
  dbPath: DB_PATH,
  adminToken: process.env.FINANCE_ADMIN_TOKEN,
  origin: process.env.FINANCE_ORIGIN,
  limits: { slots: MAX_SLOTS, bytes: MAX_MB === null ? null : MAX_MB * 1024 * 1024 },
  // Ровно «1», а не «всё, что похоже на да». «true», «yes», «on» сюда не
  // годятся нарочно: переменная открывает службу чужим людям, и угадывать, что
  // хозяин имел в виду, тут нечего. Один способ написать — один способ ошибиться.
  openRegistration: process.env.FINANCE_OPEN_REGISTRATION === "1",
  publicUrl: process.env.FINANCE_PUBLIC_URL
});

function shutdown(): void {
  void app.stop().then(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.server.listen(PORT, "127.0.0.1", () => {
  console.log(`служба слушает 127.0.0.1:${PORT}, база ${DB_PATH}`);
  if (!process.env.FINANCE_ADMIN_TOKEN) {
    console.log("управление выключено: FINANCE_ADMIN_TOKEN не задан");
  }
  console.log(
    `пределы на человека: книг ${MAX_SLOTS ?? "без предела"}, места ${MAX_MB === null ? "без предела" : `${MAX_MB} МиБ`}`
  );
  console.log(
    process.env.FINANCE_OPEN_REGISTRATION === "1"
      ? "запись открыта: завестись может любой, кто знает адрес"
      : "запись по приглашениям"
  );
});
