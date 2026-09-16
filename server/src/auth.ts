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

export async function register(db: DatabaseSync, input: RegisterInput, now: string) {
  const login = normalizeLogin(input.login);
  if (login.length < 3) throw new AuthError(400, "Имя входа короче трёх знаков.");

  const invitation = db
    .prepare("select code, used_by from invitations where code = ?")
    .get<{ code: string; used_by: string | null }>(input.code.trim());
  if (!invitation) throw new AuthError(403, "Приглашение не найдено.");
  if (invitation.used_by) throw new AuthError(403, "Приглашение уже использовано.");

  if (db.prepare("select id from people where login = ?").get(login)) {
    throw new AuthError(409, "Такое имя уже занято.");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(input.secret, salt)).toString("hex");
  const personId = id("person");

  db.prepare(
    "insert into people (id, login, secret_hash, secret_salt, vault, created_at) values (?,?,?,?,?,?)"
  ).run(personId, login, hash, salt, input.vault, now);
  db.prepare("update invitations set used_by = ?, used_at = ? where code = ?").run(
    personId,
    now,
    invitation.code
  );

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
