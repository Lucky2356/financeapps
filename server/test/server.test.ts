// Проверки службы — настоящими запросами по настоящей службе.
//
// Ни одной зависимости и здесь: `node:test` и `node:assert` встроены. Служба
// поднимается на случайном порту с базой в памяти, и по ней ходят обычным
// fetch — то есть проверяется ровно то, что увидит устройство, включая коды
// ответов. Договор живёт в кодах ответов не меньше, чем в полях: отказ «вас
// обогнали» обязан быть 409, а не 200 с полем внутри.
//
// Запуск: npm run test:server

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createApp, whichMethod, whichRoute, type App } from "../src/main.ts";

// Только латиница: заголовки HTTP не переносят ничего сверх Latin-1, и
// кириллический пропуск не отправить в принципе. То же и на живой машине —
// пропуск делается `openssl rand -base64 32`, он и так ASCII.
const ADMIN = "propusk-dlya-proverok";

let app: App;
let base: string;

/** Шкатулка понарошку: службе всё равно, что внутри, — она её не открывает. */
const VAULT = {
  v: 1,
  kdf: "PBKDF2-SHA256",
  iterations: 600000,
  password: { salt: "соль-пароля", iv: "iv", wrapped: "завёрнутый" },
  recovery: { salt: "соль-кода", iv: "iv", wrapped: "завёрнутый" }
};

const BOOK = { v: 1, alg: "AES-GCM", iv: "iv", ct: "непрочитаемое" };

async function call(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
) {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

async function invite(): Promise<string> {
  const made = await call("/admin/invite", { method: "POST", token: ADMIN });
  return (made.body as { code: string }).code;
}

async function signUp(login: string, secret = "секрет-входа") {
  const code = await invite();
  await call("/auth/register", { method: "POST", body: { code, login, vault: VAULT, secret } });
  const entered = await call("/auth/login", {
    method: "POST",
    body: { login, secret, device: "проверка" }
  });
  return entered.body as { token: string; personId: string; deviceId: string; vault: unknown };
}

describe("служба", () => {
  // Служба поднимается заново на каждую проверку. Дороже, чем чистить базу
  // между ними, и честнее: счётчики частоты живут в памяти службы, и проверка,
  // израсходовавшая попытки, тихо ломала бы следующую — причём ломала бы
  // по-разному в зависимости от порядка.
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: ADMIN });
    // Порт узнаётся только после того, как служба действительно села слушать.
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  describe("журнал", () => {
    it("пришедшее снаружи не дописывает в журнал своих строк", () => {
      // Журнал — строки, разделённые переводом строки, и читает их человек,
      // разбирающий поломку. Уйди туда адрес как есть, рядом с настоящими
      // записями появились бы выдуманные, неотличимые от них.
      const forged = "/vault/книга\nсбой запроса GET /всё-сломалось";
      const said = whichRoute(forged);

      assert.ok(!said.includes("\n"));
      assert.ok(!said.includes("сломалось"));
      assert.equal(said, "/vault/…");
    });

    it("имя ячейки в журнал не попадает", () => {
      // Имена ячеек придумывает хозяин книги — это названия его книг. Журнал
      // читает тот, кто держит машину, и для разбора поломки имя не нужно:
      // путь в коде у всех ячеек один.
      assert.equal(whichRoute("/vault/развод"), "/vault/…");
      assert.equal(whichRoute("/devices/телефон%20Пети"), "/devices/…");
    });

    it("известная ручка называется по имени — иначе разбирать нечего", () => {
      assert.equal(whichRoute("/auth/login"), "/auth/login");
      assert.equal(whichRoute("/vault"), "/vault");
      assert.equal(whichRoute("/events?с=5"), "/events");
    });

    it("незнакомое не пересказывается, а называется незнакомым", () => {
      assert.equal(whichRoute("/чего-нибудь-этакого"), "неизвестная ручка");
      // Запрос без адреса — тоже «незнакомое»: корень служба не обслуживает.
      assert.equal(whichRoute(undefined), "неизвестная ручка");
    });

    it("способ запроса тоже из набора, а не какой прислали", () => {
      // Способ приходит снаружи ровно так же, как адрес.
      assert.equal(whichMethod("PUT"), "PUT");
      assert.equal(whichMethod("ВЗЯТЬ\nподделка"), "?");
      assert.equal(whichMethod(undefined), "?");
    });
  });

  describe("живость", () => {
    it("отвечает на проверку здоровья без всякого входа", async () => {
      const response = await call("/health");
      assert.equal(response.status, 200);
    });
  });

  describe("регистрация", () => {
    it("только по приглашению", async () => {
      const response = await call("/auth/register", {
        method: "POST",
        body: { code: "выдуманное", login: "петя", vault: VAULT, secret: "с" }
      });
      assert.equal(response.status, 403);
    });

    it("приглашение одноразовое", async () => {
      const code = await invite();
      const first = await call("/auth/register", {
        method: "POST",
        body: { code, login: "петя", vault: VAULT, secret: "с" }
      });
      const second = await call("/auth/register", {
        method: "POST",
        body: { code, login: "вася", vault: VAULT, secret: "с" }
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 403);
    });

    it("имя занято — отказ, а не вторая запись", async () => {
      await signUp("петя");
      const code = await invite();
      const response = await call("/auth/register", {
        method: "POST",
        body: { code, login: "ПЕТЯ", vault: VAULT, secret: "другой" }
      });
      assert.equal(response.status, 409);
    });
  });

  describe("вход", () => {
    it("неверный секрет не пускает", async () => {
      await signUp("петя");
      const response = await call("/auth/login", {
        method: "POST",
        body: { login: "петя", secret: "не тот" }
      });
      assert.equal(response.status, 401);
    });

    it("неизвестное имя отвечает тем же, что и неверный секрет", async () => {
      // Иначе служба сама рассказывает, какие имена у неё заведены.
      await signUp("петя");
      const wrongSecret = await call("/auth/login", {
        method: "POST",
        body: { login: "петя", secret: "не тот" }
      });
      const wrongName = await call("/auth/login", {
        method: "POST",
        body: { login: "никого", secret: "не тот" }
      });
      assert.equal(wrongName.status, wrongSecret.status);
      assert.deepEqual(wrongName.body, wrongSecret.body);
    });

    it("шестая попытка подряд отказывается по частоте", async () => {
      await signUp("петя");
      const attempts = [];
      for (let i = 0; i < 6; i++) {
        attempts.push(
          (await call("/auth/login", { method: "POST", body: { login: "петя", secret: "не тот" } }))
            .status
        );
      }
      assert.deepEqual(attempts.slice(0, 5), [401, 401, 401, 401, 401]);
      assert.equal(attempts[5], 429);
    });

    it("успешный вход отдаёт шкатулку — второму устройству её взять больше негде", async () => {
      const session = await signUp("петя");
      assert.deepEqual(session.vault, VAULT);
    });

    it("выход гасит билет", async () => {
      const { token } = await signUp("петя");
      assert.equal((await call("/vault/книга", { token })).status, 200);
      await call("/auth/logout", { method: "POST", token });
      assert.equal((await call("/vault/книга", { token })).status, 401);
    });
  });

  describe("ячейки", () => {
    it("без входа не отдаются", async () => {
      assert.equal((await call("/vault/книга")).status, 401);
    });

    it("пустая ячейка — это версия ноль, а не ошибка", async () => {
      const { token } = await signUp("петя");
      const response = await call("/vault/книга", { token });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        slot: "книга",
        version: 0,
        body: null,
        updatedAt: null
      });
    });

    it("первая запись идёт поверх нуля и даёт версию один", async () => {
      const { token } = await signUp("петя");
      const put = await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: BOOK }
      });
      assert.equal(put.status, 200);
      assert.equal((put.body as { version: number }).version, 1);
    });

    it("запись поверх устаревшей версии отвергается кодом 409", async () => {
      // Сердце договора. Ответь служба здесь двумястами, устройство сочло бы
      // запись принятой и потеряло бы чужую работу молча.
      const { token } = await signUp("петя");
      await call("/vault/книга", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });

      const stale = await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: { ...BOOK, ct: "второе" } }
      });

      assert.equal(stale.status, 409);
      const outcome = stale.body as { ok: boolean; reason: string; current: { version: number } };
      assert.equal(outcome.ok, false);
      assert.equal(outcome.reason, "stale");
      // Вместе с отказом возвращается то, что лежит: чтобы устройству не ходить
      // второй раз, а сразу сливать.
      assert.equal(outcome.current.version, 1);
    });

    it("отвергнутая запись не меняет содержимого", async () => {
      const { token } = await signUp("петя");
      await call("/vault/книга", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });
      await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: { ...BOOK, ct: "второе" } }
      });
      const read = await call("/vault/книга", { token });
      assert.deepEqual((read.body as { body: unknown }).body, BOOK);
    });

    it("чужую ячейку не прочитать и не переписать", async () => {
      const petya = await signUp("петя");
      const vasya = await signUp("вася");
      await call("/vault/книга", {
        method: "PUT",
        token: petya.token,
        body: { baseVersion: 0, body: BOOK }
      });

      // У Васи ячейка с тем же именем — своя и пустая.
      const read = await call("/vault/книга", { token: vasya.token });
      assert.equal((read.body as { version: number }).version, 0);
      assert.equal((read.body as { body: unknown }).body, null);
    });

    it("отрицательная версия — это неверный запрос, а не отсчёт назад", async () => {
      const { token } = await signUp("петя");
      const response = await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: -1, body: BOOK }
      });
      assert.equal(response.status, 400);
    });
  });

  describe("что лежит в базе", () => {
    it("книга хранится ровно такой, какой приехала, — служба её не открывает", async () => {
      const { token } = await signUp("петя");
      await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: BOOK }
      });

      const row = app.db.prepare("select body from books").get<{ body: string }>();
      assert.deepEqual(JSON.parse(row?.body ?? "null"), BOOK);
      // Ключа у службы нет и быть не может — значит, и открывать нечем.
      assert.ok(!JSON.stringify(row).includes("ключ"));
    });

    it("билет лежит хешем, а не как есть: украденная база не даёт войти", async () => {
      const { token } = await signUp("петя");
      const row = app.db.prepare("select token_hash from sessions").get<{ token_hash: string }>();
      assert.ok(row);
      assert.notEqual(row?.token_hash, token);
    });
  });

  describe("устройства", () => {
    it("видны своему хозяину", async () => {
      const { token, deviceId } = await signUp("петя");
      const response = await call("/devices", { token });
      const list = response.body as { devices: Array<{ id: string }>; current: string };
      assert.equal(list.devices.length, 1);
      assert.equal(list.current, deviceId);
    });

    it("выкинутое устройство теряет билет — в этом весь смысл", async () => {
      const { token, deviceId } = await signUp("петя");
      await call(`/devices/${deviceId}`, { method: "DELETE", token });
      assert.equal((await call("/vault/книга", { token })).status, 401);
    });
  });

  describe("управление", () => {
    it("без пропуска не пускает", async () => {
      const { token } = await signUp("петя");
      // Обычный билет — не пропуск управления.
      assert.equal((await call("/admin/people", { token })).status, 403);
      assert.equal((await call("/admin/people")).status, 403);
    });

    it("показывает, кто заведён и сколько занимает", async () => {
      const { token } = await signUp("петя");
      await call("/vault/книга", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });

      const response = await call("/admin/people", { token: ADMIN });
      const people = response.body as Array<{
        login: string;
        usage: { slots: number; bytes: number };
      }>;
      assert.equal(people.length, 1);
      assert.equal(people[0].login, "петя");
      assert.equal(people[0].usage.slots, 1);
      assert.ok(people[0].usage.bytes > 0);
    });
  });

  describe("события", () => {
    it("своя запись будит собственное соединение", async () => {
      const { token } = await signUp("петя");

      const stream = await fetch(`${base}/events`, {
        headers: { authorization: `Bearer ${token}` }
      });
      const reader = stream.body?.getReader();
      assert.ok(reader);

      await call("/vault/книга", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });

      // Первым приходит приветствие, потом само событие.
      let seen = "";
      for (let i = 0; i < 4 && !seen.includes("data:"); i++) {
        const chunk = await reader.read();
        seen += new TextDecoder().decode(chunk.value);
      }
      await reader.cancel();

      assert.ok(seen.includes('"slot":"книга"'), seen);
      assert.ok(seen.includes('"version":1'), seen);
    });

    it("без входа соединение не открывается", async () => {
      const response = await fetch(`${base}/events`);
      assert.equal(response.status, 401);
      await response.text();
    });
  });
});
