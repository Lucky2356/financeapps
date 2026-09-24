// Учётные записи: регистрация по приглашению, вход, билеты.
//
// ЧЕГО СЕРВЕР НЕ ПОЛУЧАЕТ. Пароля. Устройство выводит из пароля отдельной
// ветвью «секрет входа» (см. lib/sync/vault-crypto) и присылает только его;
// обратно к ключу, которым завёрнута книга, из него хода нет. Поэтому даже
// полностью прочитанный трафик службы не открывает ни одной книги.
//
// ПОЧЕМУ ЗДЕСЬ SCRYPT, А НЕ ARGON2ID, как было написано в разборе. Argon2id
// лучше как хеш ПАРОЛЯ — и здесь хешируется не пароль. Сюда приезжают 256 бит,
// уже прошедшие через PBKDF2 на 600 000 прогонов. Чтобы подобрать их по
// украденной базе, нужно угадывать пароль и гонять те самые 600 000 прогонов на
// каждую догадку — и эта цена полностью перекрывает разницу между scrypt и
// Argon2id, которая в таком раскладе меняет стоимость перебора в единицы раз, а
// не в порядки. Зато Argon2id — нативная сборка на сервере, а scrypt лежит в
// стандартной библиотеке Node. Ноль зависимостей у службы дороже.
//
// Прямым текстом о границе: стойкость всего этого упирается в СИЛУ ПАРОЛЯ
// человека. Слабый пароль подберут по украденной базе, сколько замков ни ставь.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { sweepSessions, type Person } from "./db.ts";

/** Сколько живёт входной билет. Месяц: реже — неудобно, дольше — опаснее. */
const SESSION_DAYS = 30;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function derive(secret: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, SCRYPT.keylen, SCRYPT, (error, key) =>
      error ? reject(error) : resolve(key)
    );
  });
}

/**
 * Имя входа к общему виду.
 *
 * Приведение делается ЗДЕСЬ, а не в базе: `collate nocase` у SQLite складывает
 * только латинские буквы, и «ПЕТЯ» с «петя» остались бы двумя разными людьми —
 * второй из них зарегистрировался бы поверх первого и не смог бы войти.
 */
export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

/** Сравнение за постоянное время: иначе по времени ответа узнаётся хеш. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

/** В базе лежит хеш билета: украденная база не даёт войти. */
function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function id(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

export type RegisterInput = {
  /** Приглашение. Пусто — «без приглашения»; пустят только при открытой записи. */
  code: string;
  login: string;
  /** Шкатулка целиком, как её собрало устройство. */
  vault: string;
  secret: string;
};

export class AuthError extends Error {
  // Поле объявлено и присвоено отдельно, а не свойством-параметром: Node снимает
  // типы, но не порождает код, и свойство-параметр ему не по зубам. Ограничение
  // полезное — именно оно и держит службу без сборки.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Что нужно устройству, чтобы вывести секрет входа ДО входа.
 *
 * Соль и число прогонов — не тайна: сами по себе они ничего не открывают, а без
 * них второе устройство не сможет даже попробовать войти. Обратная сторона
 * названа честно: по ответу видно, заведено ли такое имя. Для десяти человек по
 * личным приглашениям это не та цена, ради которой стоит усложнять вход.
 */
export function authParams(db: DatabaseSync, login: string): { vaultMeta: string } {
  const person = db
    .prepare("select vault from people where login = ?")
    .get<{ vault: string }>(login);
  if (!person) throw new AuthError(404, "Такого имени здесь нет.");

  const vault = JSON.parse(person.vault) as {
    kdf: string;
    iterations: number;
    password: { salt: string };
  };
  // Отдаём ТОЛЬКО то, что нужно для вывода: соль и число прогонов. Завёрнутый
  // ключ книги остаётся здесь до успешного входа.
  return {
    vaultMeta: JSON.stringify({
      kdf: vault.kdf,
      iterations: vault.iterations,
      salt: vault.password.salt
    })
  };
}

/**
 * Завести учётную запись.
 *
 * ДВА РЕЖИМА, И ПО УМОЛЧАНИЮ — СТАРЫЙ. `open = false` значит ровно то, что
 * служба делала всегда: без приглашения никого. Открытая запись включается
 * одной переменной окружения и только тем, кто держит службу для чужих людей.
 * Порядок умолчания здесь не мелочь: переменную ставят осознанно, а вот не
 * поставить её можно и по невнимательности — и тогда служба обязана остаться
 * закрытой, а не открыться сама.
 *
 * ПРЕДЪЯВЛЕННОЕ ПРИГЛАШЕНИЕ ПРОВЕРЯЕТСЯ ВСЕГДА, даже при открытой записи.
 * Соблазн «раз пускаем всех, то и код смотреть незачем» стоил бы вот чего:
 * человек с опечаткой в коде завёлся бы успешно, а его приглашение осталось бы
 * непогашенным — и хозяин службы, глядя на список, считал бы, что этот человек
 * ещё не пришёл. Пустой код — это «у меня приглашения нет»; непустой — это
 * «вот моё», и на него отвечают по существу.
 */
/** Имя входа длиннее этого — не имя. */
const MAX_LOGIN = 64;

/**
 * Шкатулка — это завёрнутый ключ и соли, килобайт-другой. Предел с запасом в
 * десятки раз, но не 32 МиБ, как у тела запроса вообще: иначе каждая новая
 * запись, а с открытой записью их заводит кто угодно, могла положить в базу
 * тридцать мегабайт мусора.
 */
const MAX_VAULT_BYTES = 64 * 1024;

/** Управляющие знаки — перевод строки, табуляция и прочее невидимое. */
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Шкатулка должна быть шкатулкой: без соли и числа прогонов второе устройство
 * не сможет войти, а /auth/params упадёт на ней ошибкой 500.
 */
function checkVault(raw: string): void {
  if (!raw || Buffer.byteLength(raw) > MAX_VAULT_BYTES) {
    throw new AuthError(400, "Неверная шкатулка.");
  }
  let vault: { kdf?: unknown; iterations?: unknown; password?: { salt?: unknown } } | null;
  try {
    vault = JSON.parse(raw) as typeof vault;
  } catch {
    vault = null;
  }
  const good =
    !!vault &&
    typeof vault.kdf === "string" &&
    typeof vault.iterations === "number" &&
    Number.isFinite(vault.iterations) &&
    vault.iterations > 0 &&
    typeof vault.password?.salt === "string";
  if (!good) throw new AuthError(400, "Неверная шкатулка.");
}

/** Свободно ли имя и годится ли приглашение — отказ, если нет. */
function checkFree(db: DatabaseSync, login: string, code: string): void {
  if (code !== "") {
    const invitation = db
      .prepare("select used_by from invitations where code = ?")
      .get<{ used_by: string | null }>(code);
    if (!invitation) throw new AuthError(403, "Приглашение не найдено.");
    if (invitation.used_by) throw new AuthError(403, "Приглашение уже использовано.");
  }
  if (db.prepare("select id from people where login = ?").get(login)) {
    throw new AuthError(409, "Такое имя уже занято.");
  }
}

export async function register(db: DatabaseSync, input: RegisterInput, now: string, open = false) {
  const login = normalizeLogin(input.login);
  if (login.length < 3) throw new AuthError(400, "Имя входа короче трёх знаков.");
  if (login.length > MAX_LOGIN) throw new AuthError(400, "Имя входа длиннее 64 знаков.");
  if (CONTROL.test(login)) throw new AuthError(400, "В имени входа есть недопустимые знаки.");
  if (!input.secret) throw new AuthError(400, "Нет секрета входа.");
  checkVault(input.vault);

  const code = input.code.trim();
  if (code === "" && !open) throw new AuthError(403, "Приглашение не найдено.");

  // Проверки — до scrypt, чтобы отказать быстро и не жечь на отказе
  // процессор...
  checkFree(db, login, code);

  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(input.secret, salt)).toString("hex");
  const personId = id("person");

  // ...и ещё раз ПОСЛЕ него. scrypt идёт десятки миллисекунд, и в этот промежуток
  // помещается второй запрос с тем же приглашением или тем же именем: прежде
  // оба проходили проверку, и одно приглашение заводило двоих. Отсюда и до
  // конца — ни одного await: база синхронная, и чужой запрос между этими
  // строками не встанет.
  checkFree(db, login, code);
  // Человек и погашение приглашения — одной транзакцией: приглашение ссылается
  // на человека, значит он заводится первым, а если погасить не вышло, его
  // запись откатывается вместе со всем остальным.
  db.exec("begin immediate");
  try {
    db.prepare(
      "insert into people (id, login, secret_hash, secret_salt, vault, created_at) values (?,?,?,?,?,?)"
    ).run(personId, login, hash, salt, input.vault, now);
    if (code !== "") {
      const burned = db
        .prepare(
          "update invitations set used_by = ?, used_at = ? where code = ? and used_by is null"
        )
        .run(personId, now, code);
      if (burned.changes !== 1) throw new AuthError(403, "Приглашение уже использовано.");
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }

  return { personId };
}

export async function login(
  db: DatabaseSync,
  input: { login: string; secret: string; device?: string },
  now: string
) {
  const person = db
    .prepare("select * from people where login = ?")
    .get<Person>(normalizeLogin(input.login));

  // Неизвестное имя и неверный секрет отвечают ОДИНАКОВО и за одинаковое время:
  // иначе служба сама рассказывает, какие имена заведены. Вывод ключа делается
  // и в пустом случае — именно ради времени, а не ради результата.
  const salt = person?.secret_salt ?? randomBytes(16).toString("hex");
  const hash = (await derive(input.secret, salt)).toString("hex");
  if (!person || !sameHash(hash, person.secret_hash)) {
    throw new AuthError(401, "Не подходит имя или пароль.");
  }

  sweepSessions(db, now);

  const raw = token();
  const expires = new Date(Date.parse(now) + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let deviceId: string | null = null;
  if (input.device) {
    deviceId = id("device");
    db.prepare("insert into devices (id, person_id, name, last_seen_at) values (?,?,?,?)").run(
      deviceId,
      person.id,
      input.device.slice(0, 80),
      now
    );
  }

  db.prepare(
    "insert into sessions (token_hash, person_id, device_id, created_at, expires_at) values (?,?,?,?,?)"
  ).run(fingerprint(raw), person.id, deviceId, now, expires);

  return { token: raw, vault: person.vault, personId: person.id, deviceId };
}

/** Кто пришёл. null — билета нет или он просрочен. */
export function whoIs(
  db: DatabaseSync,
  raw: string | null,
  now: string
): { personId: string; deviceId: string | null } | null {
  if (!raw) return null;
  const session = db
    .prepare("select person_id, device_id, expires_at from sessions where token_hash = ?")
    .get<{ person_id: string; device_id: string | null; expires_at: string }>(fingerprint(raw));
  if (!session || session.expires_at < now) return null;
  if (session.device_id) {
    db.prepare("update devices set last_seen_at = ? where id = ?").run(now, session.device_id);
  }
  return { personId: session.person_id, deviceId: session.device_id };
}

export function logout(db: DatabaseSync, raw: string): void {
  db.prepare("delete from sessions where token_hash = ?").run(fingerprint(raw));
}

/**
 * Переименовать устройство.
 *
 * Имя угадывается по строке браузера — «Компьютер (Windows)», — и два
 * компьютера в доме неотличимы. Выкинуть потерянный телефон из списка, в
 * котором два одинаковых имени, нельзя: непонятно, который из них чей.
 *
 * Хозяин проверяется В САМОМ ЗАПРОСЕ, а не заранее: иначе между проверкой и
 * записью помещается чужой запрос, и переименовать можно было бы чужое.
 */
export function renameDevice(
  db: DatabaseSync,
  personId: string,
  deviceId: string,
  name: string
): void {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new AuthError(400, "Пустое имя устройства.");

  const changed = db
    .prepare("update devices set name = ? where id = ? and person_id = ?")
    .run(clean, deviceId, personId);
  if (changed.changes === 0) throw new AuthError(404, "Такого устройства у вас нет.");
}

/** Выкинуть устройство — вместе со всеми его билетами. */
export function forgetDevice(db: DatabaseSync, personId: string, deviceId: string): void {
  db.prepare("delete from sessions where person_id = ? and device_id = ?").run(personId, deviceId);
  db.prepare("delete from devices where person_id = ? and id = ?").run(personId, deviceId);
}

export function issueInvitation(db: DatabaseSync, now: string): string {
  const code = randomBytes(9).toString("base64url");
  db.prepare("insert into invitations (code, issued_at) values (?,?)").run(code, now);
  return code;
}
