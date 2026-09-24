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

import {
  clientAddress,
  createApp,
  sameSecret,
  whichMethod,
  whichRoute,
  type App
} from "../src/main.ts";

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

/**
 * Что служба сказала в журнал, пока шла работа.
 *
 * Строку пишет обработчик «finish», а он срабатывает на стороне службы — не
 * обязательно раньше, чем fetch на стороне проверки дочитает ответ. Поэтому
 * не «подождать 20 мс на удачу», а дождаться первой строки: проверка, которая
 * иногда успевает, а иногда нет, хуже отсутствующей.
 */
async function captured(work: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...parts: unknown[]) => void lines.push(parts.join(" "));
  try {
    await work();
    for (let tick = 0; tick < 200 && lines.length === 0; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  } finally {
    console.log = original;
  }
  return lines;
}

/**
 * Поднять службу заново с другими настройками.
 *
 * Пределы задаются при сборке службы, а общий beforeEach собирает её без них —
 * иначе каждая проверка платила бы за чужие настройки. Перезапуск стоит
 * миллисекунды (база в памяти), а проверка при этом гоняет настоящие запросы
 * по настоящей службе, собранной ровно так, как её соберёт start.ts.
 */
async function restart(options: Partial<Parameters<typeof createApp>[0]>): Promise<void> {
  await app.stop();
  app = createApp({ dbPath: ":memory:", adminToken: ADMIN, ...options });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
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

    it("каждый запрос оставляет строку", async () => {
      // Раньше служба писала только о запуске и о сбоях. Молчащий журнал
      // выглядел ровно так же, как журнал службы, к которой никто не
      // обращался, — и «устройство не пришло» от «пришло и получило отказ» по
      // нему было не отличить. Разбирать по такому журналу нечего.
      const person = await signUp("варя");
      const lines = await captured(() => call("/vault", { token: person.token }));

      assert.deepEqual(lines.length, 1);
      assert.match(lines[0], /^GET \/vault → 200 за \d+ мс$/);
    });

    it("отказ виден в журнале так же, как успех", async () => {
      // Отказ — это как раз то, за чем в журнал и лезут.
      const lines = await captured(() => call("/vault"));

      assert.match(lines[0], /^GET \/vault → 401 за \d+ мс$/);
    });

    it("имя ячейки не попадает в журнал и из живого запроса", async () => {
      // То же, что проверено выше на самой whichRoute, — но по настоящему
      // запросу: сойди эти два пути, проверка выше осталась бы зелёной.
      const person = await signUp("петя");
      const lines = await captured(() =>
        call(`/vault/${encodeURIComponent("развод")}`, { token: person.token })
      );

      assert.ok(!lines[0].includes("развод"));
      assert.match(lines[0], /^GET \/vault\/… → 200 за \d+ мс$/);
    });

    it("проверка живости молчит — иначе она одна и заполнит журнал", async () => {
      // Caddy и следилки дёргают её раз в несколько секунд.
      const lines = await captured(async () => {
        await call("/health");
        await call("/health");
        await call("/vault");
      });

      assert.deepEqual(lines.length, 1);
      assert.match(lines[0], /\/vault → 401/);
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

    it("пустое приглашение — это не «приглашения не нужно»", async () => {
      // Пустое поле и негодный код на закрытой службе отвечают одинаково, и
      // это не случайность: «у меня его нет» — такой же отказ, как «вот
      // неправильный».
      const response = await call("/auth/register", {
        method: "POST",
        body: { code: "", login: "петя", vault: VAULT, secret: "с" }
      });
      assert.equal(response.status, 403);
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

  describe("открытая запись", () => {
    // Переключатель, а не новое поведение: по умолчанию служба остаётся ровно
    // такой, какой была. Включает его тот, кто держит службу для чужих людей,
    // — и вместе с ним обязаны работать пределы, иначе это не служба, а
    // бесплатный диск для кого угодно.

    it("выключена по умолчанию — и это главное в ней", async () => {
      // Незаданная переменная окружения — самое частое состояние на свете.
      // Открывшись при ней, служба пускала бы чужих на машину человека,
      // который об этом не просил и узнал бы последним.
      assert.equal(((await call("/health")).body as { open: boolean }).open, false);
    });

    it("при включённой заводятся без приглашения", async () => {
      await restart({ openRegistration: true });
      const response = await call("/auth/register", {
        method: "POST",
        body: { code: "", login: "петя", vault: VAULT, secret: "с" }
      });
      assert.equal(response.status, 201);
    });

    it("проверка живости говорит устройству, спрашивать ли приглашение", async () => {
      // Узнать это устройство может только до входа, ничего не предъявив.
      await restart({ openRegistration: true });
      assert.equal(((await call("/health")).body as { open: boolean }).open, true);
    });

    it("предъявленное приглашение проверяется и при открытой записи", async () => {
      // Соблазн «раз пускаем всех, код можно не смотреть» стоил бы вот чего:
      // человек с опечаткой завёлся бы, а его приглашение осталось бы
      // непогашенным — и хозяин считал бы, что этот человек ещё не пришёл.
      await restart({ openRegistration: true });
      const response = await call("/auth/register", {
        method: "POST",
        body: { code: "выдуманное", login: "петя", vault: VAULT, secret: "с" }
      });
      assert.equal(response.status, 403);
    });

    it("годное приглашение гасится и при открытой записи", async () => {
      await restart({ openRegistration: true });
      const code = await invite();
      await call("/auth/register", {
        method: "POST",
        body: { code, login: "петя", vault: VAULT, secret: "с" }
      });

      const row = app.db
        .prepare("select used_by from invitations where code = ?")
        .get<{ used_by: string | null }>(code);
      assert.ok(row?.used_by, "приглашение осталось непогашенным");
    });

    it("поток новых записей с одного адреса ограничен", async () => {
      // Пока пускали по приглашениям, пределом было само приглашение. Открытая
      // запись убирает его целиком, и без замены один скрипт заводит тысячу
      // записей за минуту — каждая ценой полного прогона scrypt.
      await restart({ openRegistration: true });

      let last = 0;
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await call("/auth/register", {
          method: "POST",
          body: { code: "", login: `человек-${attempt}`, vault: VAULT, secret: "с" }
        });
        last = response.status;
      }

      assert.equal(last, 429);
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

    it("переименовываются — иначе два компьютера в доме неотличимы", async () => {
      const { token, deviceId } = await signUp("петя");
      const renamed = await call(`/devices/${deviceId}`, {
        method: "PATCH",
        token,
        body: { name: "Ноутбук на кухне" }
      });

      assert.equal(renamed.status, 204);
      const list = (await call("/devices", { token })).body as {
        devices: Array<{ name: string }>;
      };
      assert.equal(list.devices[0].name, "Ноутбук на кухне");
    });

    it("чужое устройство переименовать нельзя", async () => {
      // Хозяин сверяется в самом запросе, а не заранее: между проверкой и
      // записью помещается чужой запрос.
      const petya = await signUp("петя");
      const vasya = await signUp("вася");

      const response = await call(`/devices/${vasya.deviceId}`, {
        method: "PATCH",
        token: petya.token,
        body: { name: "моё теперь" }
      });

      assert.equal(response.status, 404);
      const his = (await call("/devices", { token: vasya.token })).body as {
        devices: Array<{ name: string }>;
      };
      assert.equal(his.devices[0].name, "проверка");
    });

    it("пустое имя — отказ, а не устройство без имени", async () => {
      const { token, deviceId } = await signUp("петя");
      const response = await call(`/devices/${deviceId}`, {
        method: "PATCH",
        token,
        body: { name: "   " }
      });
      assert.equal(response.status, 400);
    });
  });

  describe("код связки", () => {
    // Восемь знаков вместо переноса адреса и имени входа руками. Пароля в коде
    // нет и не будет: он — единственное, чем завёрнут ключ от данных, и поехав
    // в коде (а значит и в картинке QR, которую снимают из-за плеча), он сделал
    // бы бессмысленным всё шифрование разом.

    it("выдаётся только тому, кто уже вошёл", async () => {
      assert.equal((await call("/pairing", { method: "POST" })).status, 401);
    });

    it("отдаёт имя входа тому, у кого ещё ничего нет", async () => {
      // Вся суть ручки: второе устройство зовёт её, НЕ предъявив ничего, —
      // потому что предъявить ему нечего.
      const { token } = await signUp("петя");
      const made = await call("/pairing", { method: "POST", token });
      const { code } = made.body as { code: string; expiresAt: string };

      const opened = await call(`/pairing/${code}`);

      assert.equal(made.status, 201);
      assert.equal(opened.status, 200);
      assert.equal((opened.body as { login: string }).login, "петя");
    });

    it("в коде восемь знаков и ни одного похожего на другой", async () => {
      // Ноль и О, единица и I — это ровно та ошибка, после которой код
      // объявляют неработающим и идут искать другой способ.
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };

      assert.equal(code.length, 8);
      assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    });

    it("набранный как попало — тот же самый код", async () => {
      // Человек читает с одного экрана и набирает на другом: строчными, с
      // чёрточкой посередине, с пробелом от автозамены. Отказывать в этом
      // значило бы отказывать за то, как выглядит клавиатура.
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };
      const messy = `${code.slice(0, 4)}-${code.slice(4)} `.toLowerCase();

      assert.equal((await call(`/pairing/${encodeURIComponent(messy)}`)).status, 200);
    });

    it("срабатывает один раз", async () => {
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };

      assert.equal((await call(`/pairing/${code}`)).status, 200);
      const second = await call(`/pairing/${code}`);

      assert.equal(second.status, 410);
      // «Уже использован», а не «не найден»: это разные поломки, и человек
      // чинит их по-разному — во втором случае он ищет опечатку, которой нет.
      assert.match(String((second.body as { error: string }).error), /использован/);
    });

    it("истёкший не срабатывает", async () => {
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };
      // Пять минут назад. Ждать их по-настоящему проверка не будет, а
      // подменять часы службы ради одной проверки — значит проверять часы.
      app.db
        .prepare("update pairings set expires_at = ?")
        .run(new Date(Date.now() - 60_000).toISOString());

      assert.equal((await call(`/pairing/${code}`)).status, 410);
    });

    it("выдуманный не срабатывает", async () => {
      assert.equal((await call("/pairing/ABCD2345")).status, 404);
    });

    it("лежит хешем, а не как есть", async () => {
      // Украденная база не должна давать ничего, что можно предъявить службе.
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };

      const row = app.db.prepare("select code_hash from pairings").get<{ code_hash: string }>();
      assert.ok(row);
      assert.notEqual(row?.code_hash, code);
      assert.ok(!JSON.stringify(row).includes(code));
    });

    it("в журнал не попадает", async () => {
      // Код — это доступ. Журнал читают и пересылают.
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };

      const lines = await captured(() => call(`/pairing/${code}`));

      assert.ok(!lines.join("\n").includes(code), lines.join("\n"));
      assert.match(lines[0], /^GET \/pairing\/… → 200 за \d+ мс$/);
    });

    it("перебор ограничен", async () => {
      let last = 0;
      for (let attempt = 0; attempt < 21; attempt += 1) {
        last = (await call(`/pairing/ABCD234${attempt % 9}`)).status;
      }
      assert.equal(last, 429);
    });

    it("адрес отдаётся, только когда хозяин его назвал", async () => {
      // Выдумывать его из заголовка Host нельзя: заголовок приходит снаружи, и
      // служба отправила бы второе устройство туда, куда её попросил чужой.
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };
      const plain = (await call(`/pairing/${code}`)).body as Record<string, unknown>;
      assert.deepEqual(Object.keys(plain), ["login"]);

      await restart({ publicUrl: "https://finance.example.org" });
      const again = await signUp("петя");
      const second = (await call("/pairing", { method: "POST", token: again.token })).body as {
        code: string;
      };
      const named = (await call(`/pairing/${second.code}`)).body as { address: string };

      assert.equal(named.address, "https://finance.example.org");
    });

    it("код чужого человека не открывает его данных", async () => {
      // Код отдаёт имя входа — и всё. Пароль остаётся у человека, и без него
      // имя не открывает ничего.
      const { token } = await signUp("петя");
      const { code } = (await call("/pairing", { method: "POST", token })).body as {
        code: string;
      };
      const opened = (await call(`/pairing/${code}`)).body as Record<string, unknown>;

      assert.ok(!("token" in opened));
      assert.ok(!("vault" in opened));
      assert.ok(!("secret" in opened));
    });
  });

  describe("пределы на человека", () => {
    // Пределы появились вместе с открытой регистрацией и только ради неё. До
    // того единственным, кто мог переполнить службу, был её хозяин; с открытой
    // регистрацией — любой желающий, и кончившийся диск останавливает службу
    // для ВСЕХ, включая тех, кто ничего не делал.

    it("без настроек служба считает так же, как считала всегда, — никак", async () => {
      // Это главная из проверок здесь. Пределы выкатываются на машины, которые
      // уже работают; включись они сами собой, у людей молча перестала бы
      // ехать синхронизация — и выглядело бы это не как «кончилось место», а
      // как «приложение сломалось».
      const { token } = await signUp("петя");
      for (const slot of ["одна", "вторая", "третья", "четвёртая"]) {
        const put = await call(`/vault/${slot}`, {
          method: "PUT",
          token,
          body: { baseVersion: 0, body: BOOK }
        });
        assert.equal(put.status, 200, slot);
      }
    });

    it("новая книга сверх предела не заводится", async () => {
      await restart({ limits: { slots: 1, bytes: null } });
      const { token } = await signUp("петя");

      const first = await call("/vault/первая", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: BOOK }
      });
      const second = await call("/vault/вторая", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: BOOK }
      });

      assert.equal(first.status, 200);
      assert.equal(second.status, 507);
      assert.match(String((second.body as { error: string }).error), /разрешено 1/);
    });

    it("уже заведённая книга правится и тогда, когда предел книг исчерпан", async () => {
      // Предел на ЧИСЛО книг — не предел на работу в них. Считай он и правки,
      // человек с одной разрешённой книгой не смог бы записать в неё ни одной
      // операции после первой.
      await restart({ limits: { slots: 1, bytes: null } });
      const { token } = await signUp("петя");

      await call("/vault/первая", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });
      const again = await call("/vault/первая", {
        method: "PUT",
        token,
        body: { baseVersion: 1, body: BOOK }
      });

      assert.equal(again.status, 200);
    });

    it("из переполнения можно выбраться, удалив у себя половину", async () => {
      // Западня, ради которой старый размер ячейки вычитается: считай мы
      // запись добавкой к тому, что уже лежит, — и единственный выход из
      // переполнения оказался бы закрыт самим переполнением. Человек чистит
      // у себя операции, жмёт «отправить» и получает тот же отказ.
      // Числа подобраны так, чтобы проверка отличала вычитание от его
      // отсутствия. Предел 14 336 байт, книга занимает 12 000. Человек убирает
      // половину операций — остаётся 6000. С вычитанием это 6000 из 14 336;
      // без вычитания — 12 000 + 6000, и служба отказывает человеку, который
      // только что освободил место, ровно за то, что он его освободил.
      await restart({ limits: { slots: null, bytes: 14 * 1024 } });
      const { token } = await signUp("петя");

      // 6000 кириллических знаков — это 12 000 байт; см. проверку про единицы.
      const big = { ...BOOK, ct: "х".repeat(6000) };
      const filled = await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: big }
      });
      assert.equal(filled.status, 200);

      // Ещё столько же не влезает...
      const overflow = await call("/vault/вторая", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: big }
      });
      assert.equal(overflow.status, 507);

      // ...а «убрал у себя половину» — влезает.
      const cleaned = await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 1, body: { ...BOOK, ct: "х".repeat(3000) } }
      });
      assert.equal(cleaned.status, 200);
    });

    it("отказ по месту не трогает того, что уже лежит", async () => {
      // «Не уехало» не значит «потеряно» — ни на службе, ни на устройстве.
      await restart({ limits: { slots: 1, bytes: null } });
      const { token } = await signUp("петя");
      await call("/vault/первая", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });
      await call("/vault/вторая", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });

      const stored = await call("/vault/первая", { token });
      assert.equal((stored.body as { version: number }).version, 1);
      assert.equal((await call("/vault", { token })).status, 200);
      assert.equal(
        ((await call("/vault", { token })).body as { slots: unknown[] }).slots.length,
        1
      );
    });

    it("место считается байтами, а не знаками", async () => {
      // Поймано этой проверкой, а не на живой машине, — и разница тут в цене.
      // `length()` у SQLite считает текст ЗНАКАМИ: для латиницы это то же
      // самое, для кириллицы — ровно вдвое меньше правды. Хозяин выставил бы
      // предел в мегабайтах, сверял бы его по `df` — и получил бы вдвое
      // больше занятого, чем разрешал.
      await restart({ limits: { slots: null, bytes: 8 * 1024 } });
      const { token } = await signUp("петя");

      // 5000 знаков — меньше предела в 8192, будь он в знаках. В байтах это
      // 10 000, и записи здесь нечего делать.
      const cyrillic = await call("/vault/книга", {
        method: "PUT",
        token,
        body: { baseVersion: 0, body: { ...BOOK, ct: "я".repeat(5000) } }
      });

      assert.equal(cyrillic.status, 507);
    });

    it("«вас обогнали» отвечается раньше, чем «кончилось место»", async () => {
      // Порядок не вкусовой: узнай человек сначала про место, он пошёл бы
      // чистить — и вернулся бы к тому же отказу «вас обогнали», потому что
      // дело было не в месте.
      await restart({ limits: { slots: 1, bytes: null } });
      const { token } = await signUp("петя");
      await call("/vault/первая", { method: "PUT", token, body: { baseVersion: 0, body: BOOK } });

      const stale = await call("/vault/вторая", {
        method: "PUT",
        token,
        body: { baseVersion: 7, body: BOOK }
      });

      assert.equal(stale.status, 409);
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

    it("поток разрешён чужому источнику — иначе вкладка гасит его молча", async () => {
      // Заголовки потоку пишутся свои, мимо send, и разрешение на чужой
      // источник туда однажды не попало. Обычные ручки при этом работали, и
      // поломка выглядела так: «подключено», всё на месте, а чужая правка сама
      // на экран не приезжает — только после своей.
      //
      // Найдено живым прогоном двух устройств: служба писала «поток открыт»
      // каждую секунду и теряла его через пять, а вкладка не получала ни
      // события. fetch здесь этого не видит — CORS применяет браузер, не
      // сервер; поэтому проверяется сам заголовок.
      const { token } = await signUp("петя");
      const stream = await fetch(`${base}/events`, {
        headers: { authorization: `Bearer ${token}`, origin: "http://localhost:4173" }
      });
      assert.equal(stream.headers.get("access-control-allow-origin"), "*");
      assert.equal(stream.headers.get("content-type"), "text/event-stream");
      await stream.body?.cancel();
    });

    it("без входа соединение не открывается", async () => {
      const response = await fetch(`${base}/events`);
      assert.equal(response.status, 401);
      await response.text();
    });
  });
});

// Проверка кода на безопасность перед 1.46.0. Каждая проверка здесь краснела
// на прежнем коде — это и есть доказательство, что дыра была и закрыта.
describe("служба: найденное при проверке безопасности", () => {
  beforeEach(async () => {
    app = createApp({ dbPath: ":memory:", adminToken: ADMIN });
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  /** Запрос с заголовком X-Forwarded-For — тем, что присылает клиент. */
  async function forwarded(path: string, from: string, body: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": from },
      body: JSON.stringify(body)
    });
    await response.text();
    return response.status;
  }

  it("адрес для счётчиков — последний в X-Forwarded-For, а не первый", () => {
    // Первый пишет клиент, последний — свой посредник.
    assert.equal(clientAddress("127.0.0.1", "6.6.6.6, 203.0.113.7"), "203.0.113.7");
    // Не от своего посредника — заголовку не верим вовсе.
    assert.equal(clientAddress("198.51.100.9", "6.6.6.6"), "198.51.100.9");
  });

  it("подставной X-Forwarded-For не обходит предел на регистрацию", async () => {
    await restart({ openRegistration: true });
    const statuses: number[] = [];
    for (let at = 0; at < 11; at += 1) {
      // Каждый раз «новый» адрес в начале — и один и тот же настоящий в конце.
      statuses.push(
        await forwarded("/auth/register", `10.0.0.${at}, 203.0.113.7`, {
          code: "",
          login: `chelovek${at}`,
          vault: VAULT,
          secret: "s"
        })
      );
    }
    assert.equal(statuses.at(-1), 429);
  });

  it("предел на вход не обходится сменой регистра в имени", async () => {
    const statuses: number[] = [];
    for (const name of ["petya", "Petya", "PETYA", "pEtya", "peTya", "petYa"]) {
      statuses.push(
        (await call("/auth/login", { method: "POST", body: { login: name, secret: "x" } })).status
      );
    }
    assert.equal(statuses.at(-1), 429);
  });

  it("пропуск управления сравнивается за постоянное время — и верно", () => {
    assert.equal(sameSecret(ADMIN, ADMIN), true);
    assert.equal(sameSecret(`${ADMIN}x`, ADMIN), false);
    assert.equal(sameSecret(null, ADMIN), false);
    assert.equal(sameSecret(ADMIN, ""), false);
  });

  it("битая %-последовательность — 400, а не внутренняя ошибка", async () => {
    const { token } = await signUp("petya");
    const response = await call("/vault/%E0%A4%A", { token });
    assert.equal(response.status, 400);
  });

  it("слишком длинное имя ячейки — 400", async () => {
    const { token } = await signUp("petya");
    const response = await call(`/vault/${"я".repeat(300)}`, {
      method: "PUT",
      token,
      body: { baseVersion: 0, body: BOOK }
    });
    assert.equal(response.status, 400);
  });

  it("имя входа: не длиннее 64 знаков и без невидимых знаков", async () => {
    for (const login of ["x".repeat(65), "petya\nadmin", "pe\u0000tya"]) {
      const response = await call("/auth/register", {
        method: "POST",
        body: { code: await invite(), login, vault: VAULT, secret: "s" }
      });
      assert.equal(response.status, 400, JSON.stringify(login));
    }
  });

  it("шкатулка — настоящая и небольшая", async () => {
    for (const vault of [
      undefined,
      "строка",
      { kdf: "x" },
      { ...VAULT, junk: "я".repeat(70_000) }
    ]) {
      const response = await call("/auth/register", {
        method: "POST",
        body: { code: await invite(), login: "petya", vault, secret: "s" }
      });
      assert.equal(response.status, 400);
    }
  });

  it("одно приглашение не заводит двоих, даже одновременно", async () => {
    const code = await invite();
    const [first, second] = await Promise.all([
      call("/auth/register", {
        method: "POST",
        body: { code, login: "petya", vault: VAULT, secret: "s" }
      }),
      call("/auth/register", {
        method: "POST",
        body: { code, login: "vasya", vault: VAULT, secret: "s" }
      })
    ]);
    assert.deepEqual([first.status, second.status].sort(), [201, 403]);
  });

  it("живых кодов связки у человека — не больше пяти", async () => {
    const { token } = await signUp("petya");
    const statuses: number[] = [];
    for (let at = 0; at < 6; at += 1) {
      statuses.push((await call("/pairing", { method: "POST", token })).status);
    }
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  });
});
