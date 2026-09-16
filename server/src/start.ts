// Запуск службы: прочитать настройки, поднять, аккуратно опуститься.
//
// Настройки — через окружение, потому что так их задаёт systemd и так они не
// попадают в git:
//   FINANCE_DB          путь к базе (по умолчанию ./finance.db)
//   FINANCE_PORT        порт (по умолчанию 8787)
//   FINANCE_ADMIN_TOKEN пропуск к страницам управления; пусто — выключено
//   FINANCE_ORIGIN      кому отвечать; по умолчанию всем
//
// Слушаем только 127.0.0.1: наружу служба смотрит через Caddy, который и держит
// TLS. Открой она порт всему свету — к ней можно было бы прийти по HTTP в обход
// сертификата, и билет уехал бы открытым текстом.

import { createApp } from "./main.ts";

const DB_PATH = process.env.FINANCE_DB ?? "./finance.db";
const PORT = Number(process.env.FINANCE_PORT ?? 8787);

const app = createApp({
  dbPath: DB_PATH,
  adminToken: process.env.FINANCE_ADMIN_TOKEN,
  origin: process.env.FINANCE_ORIGIN
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
});
