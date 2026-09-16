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

import {
  AuthError,
  authParams,
  forgetDevice,
  issueInvitation,
  login,
  logout,
  register,
  whoIs
} from "./auth.ts";
import { openDatabase } from "./db.ts";
import { EventBus } from "./events.ts";
import { RateLimiter } from "./rate-limit.ts";
import { readSlot, usageOf, writeSlot, MAX_BODY_BYTES } from "./vault.ts";

export type AppOptions = {
  /** Путь к базе. ":memory:" — для проверок. */
  dbPath: string;
  /** Пропуск к страницам управления. Пусто — управление выключено. */
  adminToken?: string;
  /** Кому отвечать. По умолчанию всем; см. оговорку выше. */
  origin?: string;
};

export function createApp(options: AppOptions) {
  const ADMIN_TOKEN = options.adminToken ?? "";
  const ORIGIN = options.origin ?? "*";

  const db = openDatabase(options.dbPath);
  const bus = new EventBus();
  const byLogin = new RateLimiter();
  // По адресу предел заметно шире, чем по имени, и это не поблажка. За одним
  // адресом сидит целая семья — общий роутер, раздача с телефона, — и пять
  // попыток на всех означали бы, что один человек, дважды ошибившийся паролем,
  // запирает вход остальным. Подбор ПАРОЛЯ ограничивает счётчик по имени;
  // счётчик по адресу нужен от другого — от того, кто перебирает имена подряд.
  const byAddress = new RateLimiter(30);

  function now(): string {
    return new Date().toISOString();
  }

  function send(res: ServerResponse, status: number, body?: unknown): void {
    const text = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    // За Caddy настоящий адрес приходит заголовком; без посредника берём сокет.
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
    return req.socket.remoteAddress ?? "неизвестно";
  }

  function text(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://служба");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "OPTIONS") return send(res, 204);
    if (path === "/health") return send(res, 200, { ok: true });

    // ——— вход ——————————————————————————————————————————————————————

    if (path === "/auth/params" && method === "GET") {
      const params = authParams(db, text(url.searchParams.get("login")));
      return send(res, 200, JSON.parse(params.vaultMeta));
    }

    if (path === "/auth/register" && method === "POST") {
      const body = await readJson(req);
      const created = await register(
        db,
        {
          code: text(body.code),
          login: text(body.login),
          vault: JSON.stringify(body.vault),
          secret: text(body.secret)
        },
        now()
      );
      return send(res, 201, created);
    }

    if (path === "/auth/login" && method === "POST") {
      const body = await readJson(req);
      const name = text(body.login);
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
    const admin = ADMIN_TOKEN !== "" && raw === ADMIN_TOKEN;

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

    if (path.startsWith("/devices/") && method === "DELETE") {
      forgetDevice(db, who.personId, decodeURIComponent(path.slice("/devices/".length)));
      return send(res, 204);
    }

    if (path === "/events" && method === "GET") return bus.attach(who.personId, res);

    if (path.startsWith("/vault/")) {
      const slot = decodeURIComponent(path.slice("/vault/".length));
      if (!slot) return send(res, 400, { error: "Не указана ячейка." });

      if (method === "GET") return send(res, 200, readSlot(db, who.personId, slot));

      if (method === "PUT") {
        const body = await readJson(req);
        const baseVersion = Number(body.baseVersion);
        if (!Number.isInteger(baseVersion) || baseVersion < 0) {
          return send(res, 400, { error: "Неверная версия." });
        }

        const outcome = writeSlot(db, who.personId, slot, baseVersion, body.body, now());
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

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (error instanceof AuthError) return send(res, error.status, { error: error.message });
      // Наружу — без подробностей: текст ошибки службы человеку не поможет, а
      // нападающему расскажет об её устройстве. В журнал — полностью.
      console.error("сбой запроса", req.method, req.url, error);
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
