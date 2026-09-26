// Служба целиком: один процесс, одна база, ноль зависимостей.
//
// Здесь она только СОБИРАЕТСЯ. Слушать порт — дело start.ts, и разделение это
// не ради красоты: собранную, но не слушающую службу можно поднять в проверке
// на случайном порту и погонять по ней настоящие запросы. Слушай она прямо
// отсюда, проверить договор можно было бы только на живой машине — то есть
// уже после того, как что-то сломалось.
//
// Про «отвечать всем»: вход здесь по заголовку, а не по печенью. Чужая
// страница, открытая в браузере, не может подставить билет, которого у неё нет,
// — поэтому разрешение читать ответы никому ничего не даёт. С печеньем такое
// было бы дырой; здесь — нет.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  AuthError,
  authParams,
  forgetDevice,
  issueInvitation,
  login,
  logout,
  normalizeLogin,
  register,
  renameDevice,
  whoIs
} from "./auth.ts";
import { openDatabase } from "./db.ts";
import { EventBus } from "./events.ts";
import {
  answerRequest,
  issuePairing,
  joinPairing,
  openRequest,
  pollRequest,
  redeemPairing
} from "./pairing.ts";
import { RateLimiter } from "./rate-limit.ts";
import {
  listSlots,
  readSlot,
  usageOf,
  writeSlot,
  MAX_BODY_BYTES,
  NO_LIMITS,
  type Limits
} from "./vault.ts";

/**
 * Что сказать в журнале о запросе, на котором служба сломалась.
 *
 * Не путь запроса, а ОПИСАНИЕ ручки, выбранное из заранее известного набора.
 * Разница здесь важна дважды, и оба раза по существу.
 *
 * Первое — про человека. В пути лежат имена ячеек, а их придумывает сам
 * хозяин книги: это названия его книг. Журнал службы читает тот, кто держит
 * машину, и знать, что у кого-то заведена книга «развод», ему незачем. Раз
 * знание не нужно для разбора поломки, ему нечего делать и в журнале.
 *
 * Второе — про сам журнал. Пришедшее снаружи, положенное в журнал как есть,
 * позволяет кому угодно дописать туда СВОИ строки: перевод строки в адресе — и
 * рядом с настоящими записями появляются выдуманные, неотличимые от них. Это
 * порча того единственного, по чему потом разбирают случившееся. Набор
 * постоянных строк не подделать ничем: что бы ни прислали, в журнал уйдёт одна
 * из перечисленных ниже — и никакая другая.
 *
 * Для разбора поломки этого хватает: вид ручки и полная ошибка со следом
 * вызовов говорят, где сломалось. Имя ячейки не сказало бы ничего сверх —
 * путь в коде у всех ячеек один.
 */
const KNOWN_ROUTES: readonly string[] = [
  "/health",
  "/auth/params",
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/events",
  "/vault",
  "/devices",
  "/pairing",
  "/admin/people",
  "/admin/invite"
];

const KNOWN_METHODS: readonly string[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "PATCH"
];

/**
 * Часть пути, раскодированная, — или отказ 400.
 *
 * decodeURIComponent бросает на битой «%»-последовательности, и такой адрес
 * становился внутренней ошибкой 500 с полным следом в журнале. Это не поломка
 * службы, а неверный запрос, и отвечать на него надо как на неверный.
 */
export function decodePart(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new AuthError(400, "Неверный адрес.");
  }
}

/** Имя ячейки длиннее этого — не имя, а попытка забить базу мусором. */
export const MAX_SLOT_NAME = 200;

/**
 * Совпадает ли предъявленное с пропуском управления — за постоянное время.
 *
 * Обычное сравнение строк останавливается на первом несовпавшем знаке, и по
 * времени ответа пропуск подбирается знак за знаком. Сравниваются отпечатки:
 * у них одинаковая длина, какой бы ни была длина пропуска.
 */
export function sameSecret(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const left = createHash("sha256").update(given).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/**
 * Адрес, с которого пришёл запрос, — для счётчиков попыток.
 *
 * X-Forwarded-For присылает КЛИЕНТ, и прежде здесь бралось его первое значение.
 * Подставив туда случайный адрес на каждый запрос, можно было обойти все
 * пределы разом: на подбор кода связки, на регистрацию, на вход. Теперь
 * заголовку верим, только если запрос пришёл от своего посредника (служба
 * слушает 127.0.0.1, и посредник — это Caddy на той же машине), и берём
 * ПОСЛЕДНЕЕ значение: его дописал сам посредник, а всё, что левее, мог
 * написать кто угодно.
 */
export function clientAddress(peer: string | undefined, forwarded: string | undefined): string {
  const local = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  if (local && forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return peer ?? "неизвестно";
}

export function whichRoute(url: string | undefined): string {
  let path: string;
  try {
    path = new URL(url ?? "/", "http://служба").pathname;
  } catch {
    return "неразборчивый адрес";
  }

  if (KNOWN_ROUTES.includes(path)) return path;
  // Ячейку и устройство называем видом, а не именем: имя — это данные хозяина.
  if (path.startsWith("/vault/")) return "/vault/…";
  if (path.startsWith("/devices/")) return "/devices/…";
  // Код связки — это доступ. В журнале ему делать нечего тем более: журнал
  // читают и пересылают, а код живёт пять минут и отдаёт имя входа.
  if (path.startsWith("/pairing/")) return "/pairing/…";
  return "неизвестная ручка";
}

export function whichMethod(method: string | undefined): string {
  return method && KNOWN_METHODS.includes(method) ? method : "?";
}

export type AppOptions = {
  /** Путь к базе. ":memory:" — для проверок. */
  dbPath: string;
  /** Пропуск к страницам управления. Пусто — управление выключено. */
  adminToken?: string;
  /** Кому отвечать. По умолчанию всем; см. оговорку выше. */
  origin?: string;
  /** Сколько позволено одному человеку. По умолчанию — без пределов. */
  limits?: Limits;
  /**
   * Пускать ли без приглашения. По умолчанию — нет, как было всегда.
   *
   * Умолчание здесь не вкусовое. Переменную окружения ставят осознанно, а не
   * поставить её можно по невнимательности; служба, открывшаяся сама, — это
   * чужие люди на чужой машине, о которых хозяин узнаёт последним.
   */
  openRegistration?: boolean;
  /**
   * Каким адресом служба зовётся снаружи, например https://finance.example.org
   *
   * Нужен ровно в одном месте — в ответе на код связки. Сама служба своего
   * внешнего имени не знает и знать не может: она слушает 127.0.0.1, а имя
   * живёт в настройках Caddy. Не задан — код отдаёт только имя входа, и второе
   * устройство берёт адрес тот, по которому само же и спросило.
   */
  publicUrl?: string;
};

export function createApp(options: AppOptions) {
  const ADMIN_TOKEN = options.adminToken ?? "";
  const ORIGIN = options.origin ?? "*";
  const LIMITS = options.limits ?? NO_LIMITS;
  const OPEN = options.openRegistration ?? false;
  const PUBLIC_URL = options.publicUrl ?? "";

  const db = openDatabase(options.dbPath);
  const bus = new EventBus();
  const byLogin = new RateLimiter();
  // По адресу предел заметно шире, чем по имени, и это не поблажка. За одним
  // адресом сидит целая семья — общий роутер, раздача с телефона, — и пять
  // попыток на всех означали бы, что один человек, дважды ошибившийся паролем,
  // запирает вход остальным. Подбор ПАРОЛЯ ограничивает счётчик по имени;
  // счётчик по адресу нужен от другого — от того, кто перебирает имена подряд.
  const byAddress = new RateLimiter(30);
  // Счётчик на РЕГИСТРАЦИЮ, и появился он вместе с открытой записью. Пока
  // пускали по приглашениям, пределом было само приглашение: без него дальше
  // первой же проверки не проходили. Открытая запись убирает этот предел
  // целиком — и без замены один скрипт заводит тысячу записей за минуту,
  // каждая из которых стоит службе полного прогона scrypt.
  //
  // Час, а не минута: заводят запись один раз в жизни, и человеку незачем
  // делать это чаще. Десять на адрес — с запасом на общий роутер и на того,
  // кто трижды ошибся именем; скрипту десять в час не дают ничего.
  const newcomers = new RateLimiter(10, 60 * 60 * 1000);
  // Предъявление кода связки. Ручка отвечает БЕЗ входа — иначе второе
  // устройство, у которого ещё ничего нет, не могло бы её позвать вовсе, — и
  // это единственная такая ручка, отдающая хоть что-то о человеке. Перебрать
  // 2^40 кодов по двадцать попыток в минуту нельзя и за век, но без счётчика
  // об этом пришлось бы рассуждать, а со счётчиком — не приходится.
  const guessers = new RateLimiter(20);
  // Новое устройство при обратной связке спрашивает «ответили ли» каждые пару
  // секунд. Шестьдесят в минуту — с запасом на два устройства за одним роутером.
  const waiters = new RateLimiter(60);

  function now(): string {
    return new Date().toISOString();
  }

  function send(res: ServerResponse, status: number, body?: unknown): void {
    const text = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "content-length": Buffer.byteLength(text)
    });
    res.end(text);
  }

  async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      // Предел проверяется ПО ХОДУ, а не после: иначе достаточно одного запроса
      // на гигабайт, чтобы служба легла, не дочитав его.
      if (size > MAX_BODY_BYTES) throw new AuthError(413, "Слишком большой запрос.");
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new AuthError(400, "Тело запроса — не JSON.");
    }
  }

  function bearer(req: IncomingMessage): string | null {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
    return header.slice(7).trim() || null;
  }

  function addressOf(req: IncomingMessage): string {
    const forwarded = req.headers["x-forwarded-for"];
    return clientAddress(
      req.socket.remoteAddress,
      typeof forwarded === "string" ? forwarded : undefined
    );
  }

  function text(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://служба");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "OPTIONS") return send(res, 204);
    // Про «open» в проверке живости. Устройству надо знать, спрашивать ли у
    // человека приглашение, — и узнать это оно может только до входа, то есть
    // не предъявив ничего. Отдельная ручка для одного поля была бы лишней, а
    // тайны в этом поле нет: открытость службы видна и так, с первой же
    // попытки завестись без приглашения.
    if (path === "/health") return send(res, 200, { ok: true, open: OPEN });

    // ——— вход ——————————————————————————————————————————————————————

    // Код связки предъявляется ДО входа: у второго устройства ещё ничего нет.
    if (path.startsWith("/pairing/") && method === "GET") {
      if (!guessers.allow(`связка:${addressOf(req)}`, Date.now())) {
        return send(res, 429, { error: "Слишком много попыток. Подождите минуту." });
      }
      const code = decodePart(path.slice("/pairing/".length));
      const found = redeemPairing(db, code, now());
      // Адрес отдаётся только если хозяин его назвал. Выдумывать его из
      // заголовка Host нельзя: заголовок приходит снаружи, и служба
      // отправила бы второе устройство туда, куда её попросил чужой.
      return send(res, 200, PUBLIC_URL ? { ...found, address: PUBLIC_URL } : found);
    }

    // Обратная связка: картинку показывает новое устройство. Здесь оно
    // открывает запрос и потом спрашивает, ответили ли на него. Обе ручки —
    // без входа: у нового устройства ещё ничего нет.
    if (path === "/pairing/request" && method === "POST") {
      if (!guessers.allow(`запрос:${addressOf(req)}`, Date.now())) {
        return send(res, 429, { error: "Слишком много попыток. Подождите минуту." });
      }
      return send(res, 201, openRequest(db, now()));
    }

    if (path.startsWith("/pairing/request/") && method === "POST") {
      // Спрашивают раз в пару секунд пять минут подряд — отдельный счётчик,
      // шире, чем на коды: билет в 256 бит перебором не взять.
      if (!waiters.allow(`ждёт:${addressOf(req)}`, Date.now())) {
        return send(res, 429, { error: "Слишком много попыток. Подождите минуту." });
      }
      const body = await readJson(req);
      const ticket = decodePart(path.slice("/pairing/request/".length));
      const joined = pollRequest(db, ticket, now(), text(body.device));
      if (!joined) return send(res, 202, { waiting: true });
      return send(res, 200, PUBLIC_URL ? { ...joined, address: PUBLIC_URL } : joined);
    }

    // Войти по коду связки — без имени и пароля. Новому устройству заводится
    // свой билет, и отдаётся пакет, запечатанный тем, что есть только в
    // картинке QR.
    if (path.startsWith("/pairing/") && method === "POST") {
      if (!guessers.allow(`связка:${addressOf(req)}`, Date.now())) {
        return send(res, 429, { error: "Слишком много попыток. Подождите минуту." });
      }
      const body = await readJson(req);
      const code = decodePart(path.slice("/pairing/".length));
      const joined = joinPairing(db, code, now(), text(body.device));
      return send(res, 200, PUBLIC_URL ? { ...joined, address: PUBLIC_URL } : joined);
    }

    if (path === "/auth/params" && method === "GET") {
      // Ручка без входа, и по ответу видно, заведено ли имя. Без счётчика по
      // ней перебирают имена подряд — с открытой записью это уже не десять
      // своих, а кто угодно.
      if (!byAddress.allow(`имена:${addressOf(req)}`, Date.now())) {
        return send(res, 429, { error: "Слишком много попыток. Подождите минуту." });
      }
      const params = authParams(db, text(url.searchParams.get("login")));
      return send(res, 200, JSON.parse(params.vaultMeta));
    }

    if (path === "/auth/register" && method === "POST") {
      if (!newcomers.allow(`запись:${addressOf(req)}`, Date.now())) {
        return send(res, 429, {
          error: "Слишком много новых записей с этого адреса. Попробуйте позже."
        });
      }

      const body = await readJson(req);
      const created = await register(
        db,
        {
          code: text(body.code),
          login: text(body.login),
          vault: body.vault === undefined ? "" : JSON.stringify(body.vault),
          secret: text(body.secret)
        },
        now(),
        OPEN
      );
      return send(res, 201, created);
    }

    if (path === "/auth/login" && method === "POST") {
      const body = await readJson(req);
      // Счётчик — по имени В ОБЩЕМ ВИДЕ, тем же, каким его сравнивает вход.
      // Прежде он брал имя как прислано, а вход сравнивал без учёта регистра:
      // «петя», «Петя» и «ПЕТЯ» были тремя счётчиками на одного человека, и
      // предел на подбор пароля обходился сменой регистра.
      const name = normalizeLogin(text(body.login));
      const stamp = Date.now();
      if (
        !byLogin.allow(`имя:${name}`, stamp) ||
        !byAddress.allow(`адрес:${addressOf(req)}`, stamp)
      ) {
        return send(res, 429, { error: "Слишком много попыток. Подождите минуту." });
      }

      const session = await login(
        db,
        { login: name, secret: text(body.secret), device: text(body.device) || undefined },
        now()
      );
      byLogin.forget(`имя:${name}`);
      return send(res, 200, { ...session, vault: JSON.parse(session.vault) as unknown });
    }

    // ——— всё дальше требует билета ————————————————————————————————————

    const raw = bearer(req);
    const who = whoIs(db, raw, now());
    const admin = sameSecret(raw, ADMIN_TOKEN);

    if (path.startsWith("/admin/")) {
      if (!admin) return send(res, 403, { error: "Нужен пропуск управления." });

      if (path === "/admin/people" && method === "GET") {
        const people = db
          .prepare("select id, login, created_at from people order by created_at")
          .all<{ id: string; login: string; created_at: string }>();
        return send(
          res,
          200,
          people.map((person) => ({ ...person, usage: usageOf(db, person.id) }))
        );
      }
      if (path === "/admin/invite" && method === "POST") {
        return send(res, 201, { code: issueInvitation(db, now()) });
      }
      return send(res, 404, { error: "Нет такой ручки." });
    }

    if (!who) return send(res, 401, { error: "Нужен вход." });

    if (path === "/auth/logout" && method === "POST") {
      if (raw) logout(db, raw);
      return send(res, 204);
    }

    if (path === "/devices" && method === "GET") {
      const devices = db
        .prepare(
          "select id, name, last_seen_at from devices where person_id = ? order by last_seen_at desc"
        )
        .all(who.personId);
      return send(res, 200, { devices, current: who.deviceId });
    }

    if (path === "/pairing" && method === "POST") {
      const body = await readJson(req);
      // С билетом — ответ на картинку нового устройства (обратная связка).
      const ticket = text(body.request);
      return send(
        res,
        201,
        ticket
          ? answerRequest(db, who.personId, now(), text(body.sealed), ticket)
          : issuePairing(db, who.personId, now(), text(body.sealed))
      );
    }

    if (path.startsWith("/devices/") && method === "PATCH") {
      const body = await readJson(req);
      renameDevice(db, who.personId, decodePart(path.slice("/devices/".length)), text(body.name));
      return send(res, 204);
    }

    if (path.startsWith("/devices/") && method === "DELETE") {
      forgetDevice(db, who.personId, decodePart(path.slice("/devices/".length)));
      return send(res, 204);
    }

    if (path === "/events" && method === "GET") {
      // Отдельно от строки на «finish»: та придёт только при разрыве, а знать,
      // что устройство на связи, нужно именно сейчас.
      console.log("GET /events → поток открыт");
      return bus.attach(who.personId, res, ORIGIN);
    }

    if (path === "/vault" && method === "GET") {
      return send(res, 200, { slots: listSlots(db, who.personId) });
    }

    if (path.startsWith("/vault/")) {
      const slot = decodePart(path.slice("/vault/".length));
      if (!slot) return send(res, 400, { error: "Не указана ячейка." });
      if (slot.length > MAX_SLOT_NAME)
        return send(res, 400, { error: "Слишком длинное имя ячейки." });

      if (method === "GET") return send(res, 200, readSlot(db, who.personId, slot));

      if (method === "PUT") {
        const body = await readJson(req);
        const baseVersion = Number(body.baseVersion);
        if (!Number.isInteger(baseVersion) || baseVersion < 0) {
          return send(res, 400, { error: "Неверная версия." });
        }

        const outcome = writeSlot(db, who.personId, slot, baseVersion, body.body, now(), LIMITS);
        if (!outcome.ok && outcome.reason === "full") {
          // 507, а не 409 и не 403. 409 значит «сходите за свежим и повторите» —
          // устройство так и сделает, упрётся в то же самое и будет ходить по
          // кругу, показывая человеку «вас обогнали» вместо «кончилось место».
          // 507 устройство трактует как отказ, повторять который бесполезно, —
          // и показывает текст. Данные при этом остаются на устройстве целыми:
          // не уехало — не значит потеряно.
          return send(res, 507, { error: outcome.error });
        }
        if (!outcome.ok) {
          // Отказ «вас обогнали» — 409, а не 200 с полем: по договору это другой
          // исход, и путать его с успехом на уровне кода ответа нельзя.
          return send(res, 409, outcome);
        }
        bus.announce(who.personId, slot, outcome.version);
        return send(res, 200, outcome);
      }
    }

    return send(res, 404, { error: "Нет такой ручки." });
  }

  /**
   * Одна строка в журнал на каждый запрос.
   *
   * До этого служба писала только о том, как поднялась, и о сбоях. Молчащий
   * журнал при этом выглядит ровно так же, как журнал службы, к которой никто
   * не обращался, — и различить «устройство не пришло» и «пришло и получило
   * отказ» по нему нельзя. Вживую это стоило вечера: человек прислал журнал, в
   * котором были только строки запуска, и он не значил ничего.
   *
   * В строке нет ничего, пришедшего снаружи: вид ручки и метод выбираются из
   * постоянных наборов (см. whichRoute/whichMethod выше), код ответа и время —
   * числа. Дописать в журнал свою строку переводом строки в адресе нельзя.
   *
   * Два конца, а не один. Обычный ответ заканчивается res.end(), и это
   * «finish» — там есть код ответа. Поток событий не заканчивается никогда:
   * его рвут с той стороны, end() не зовёт никто, и «finish» не приходит. Без
   * второго конца самые долгие соединения — как раз те, из-за которых и лезут
   * в журнал, — не оставляли бы следа вовсе.
   *
   * Проверка живости молчит: Caddy и следилки дёргают её раз в несколько
   * секунд, и в журнале от неё остаётся только шум, из-за которого настоящие
   * запросы приходится выискивать.
   */
  function note(req: IncomingMessage, res: ServerResponse): void {
    const route = whichRoute(req.url);
    if (route === "/health") return;

    const started = Date.now();
    let said = false;
    function say(outcome: string): void {
      // «close» приходит и после обычного «finish» — иначе каждый запрос
      // попадал бы в журнал дважды, вторым разом с неверным исходом.
      if (said) return;
      said = true;
      console.log(`${whichMethod(req.method)} ${route} → ${outcome} за ${Date.now() - started} мс`);
    }

    res.on("finish", () => say(String(res.statusCode)));
    res.on("close", () => say("связь оборвана"));
  }

  const server = createServer((req, res) => {
    note(req, res);
    route(req, res).catch((error: unknown) => {
      if (error instanceof AuthError) return send(res, error.status, { error: error.message });
      // Наружу — без подробностей: текст ошибки службы человеку не поможет, а
      // нападающему расскажет об её устройстве. В журнал — полностью, но путь
      // запроса приходит СНАРУЖИ, и класть его в журнал как есть нельзя.
      console.error("сбой запроса", whichMethod(req.method), whichRoute(req.url), error);
      send(res, 500, { error: "Внутренняя ошибка." });
    });
  });

  // Молчащее соединение посредники закрывают через минуту-другую. unref, чтобы
  // этот таймер сам по себе не держал процесс живым — иначе проверка, поднявшая
  // службу, никогда не закончится.
  const beat = setInterval(() => bus.heartbeat(), 25_000);
  beat.unref();

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      clearInterval(beat);
      bus.closeAll();
      server.close(() => {
        db.close();
        resolve();
      });
    });
  }

  return { server, db, stop };
}

export type App = ReturnType<typeof createApp>;
