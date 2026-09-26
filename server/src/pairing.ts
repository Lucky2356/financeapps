// Короткий код связки: как второе устройство узнаёт, куда идти и под каким
// именем.
//
// ЗАЧЕМ ОН ВООБЩЕ. Сегодня, чтобы подключить телефон, человек переносит на него
// руками адрес службы и имя входа — и ошибается ровно там, где ошибиться проще
// всего: в адресе. Код заменяет оба переноса одним: восемь знаков, которые
// видно с экрана напротив.
//
// ЧЕГО В КОДЕ НЕТ И НЕ БУДЕТ — ПАРОЛЯ. Это решение владельца, и оно правильное:
// пароль — единственное, чем завёрнут ключ от данных, и поехав в коде (а значит
// и в картинке QR, которую можно снять из-за плеча или переслать в мессенджере),
// он сделал бы бессмысленным всё шифрование разом. Поэтому на втором устройстве
// пароль вводят руками. Это единственное, что там вводят руками.
//
// ЧТО КОД ОТДАЁТ. Имя входа — и всё. Оно не тайна: служба и так отвечает на
// /auth/params, заведено ли такое имя. Но и разбрасываться им незачем, отсюда
// три ограничения сразу — пять минут жизни, один раз и предел частоты на
// предъявление.
//
// ПОЧЕМУ ХВАТАЕТ ВОСЬМИ ЗНАКОВ. Алфавит из 32 знаков даёт 32^8 — это 2^40,
// больше триллиона. Даже без предела частоты перебрать их за пять минут нельзя;
// с пределом разговор об этом кончается, не начавшись. А восемь знаков человек
// переносит с экрана на экран, не сбиваясь, — шестнадцать уже нет, и это не
// придирка: код, который набирают с ошибками, люди перестают набирать.

import { createHash, randomBytes, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { AuthError, openSession } from "./auth.ts";
import { sweepPairings } from "./db.ts";

/**
 * Алфавит без похожих знаков.
 *
 * Нет 0 и O, 1 и I и L. Человек читает код с одного экрана и набирает на
 * другом, часто с телефона в полутьме, — и «ноль или буква О» это ровно та
 * ошибка, после которой код объявляют неработающим и идут искать другой способ.
 * Цена отказа от четырёх знаков — алфавит 32 вместо 36, то есть 2^40 вместо
 * 2^41. Не та величина, ради которой стоит спорить с человеческим глазом.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const LENGTH = 8;

/** Пять минут. Дольше — код живёт в чужих руках; короче — не успеть набрать. */
const LIVES_MS = 5 * 60 * 1000;

/** В базе лежит хеш кода: украденная база не даёт предъявить его службе. */
function fingerprint(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");
}

/**
 * Код к общему виду: только знаки алфавита, заглавными.
 *
 * Человек набирает его как видит — со строчными буквами, с чёрточкой посередине
 * («ABCD-EFGH» читается вдвое легче сплошных восьми), с пробелом на конце от
 * автозамены. Всё это — тот же самый код, и отказывать в нём значило бы
 * отказывать за то, как выглядит клавиатура.
 */
export function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

function fresh(): string {
  let code = "";
  // randomInt, а не Math.random: код — это доступ, пусть на пять минут, и
  // предсказуемый генератор здесь означал бы предсказуемый код.
  for (let at = 0; at < LENGTH; at += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export type IssuedCode = { code: string; expiresAt: string };

/** Выдать код. Прежние коды человека при этом не гасятся: они истекут сами. */
/**
 * Сколько живых кодов может быть у одного человека сразу. Каждый — ещё одна
 * дверь, которую перебирают; пять хватит на любую связку, а сотня нужна только
 * тому, кто хочет расширить себе поле для перебора.
 */
const MAX_LIVE = 5;

/**
 * Пакет связки — не больше этого. Внутри ключ данных и пара служебных строк,
 * сотни байт; предел с запасом, но не тридцать мегабайт тела запроса.
 */
const MAX_SEALED_BYTES = 16 * 1024;

export function issuePairing(
  db: DatabaseSync,
  personId: string,
  now: string,
  sealed = ""
): IssuedCode {
  sweepPairings(db, now);
  if (Buffer.byteLength(sealed) > MAX_SEALED_BYTES) {
    throw new AuthError(413, "Слишком большой пакет связки.");
  }

  const live = db
    .prepare(
      "select count(*) as n from pairings where person_id = ? and used_at is null and expires_at > ?"
    )
    .get<{ n: number }>(personId, now);
  if ((live?.n ?? 0) >= MAX_LIVE) {
    throw new AuthError(429, "Слишком много кодов подряд. Подождите пять минут.");
  }

  const code = fresh();
  const expires = new Date(Date.parse(now) + LIVES_MS).toISOString();
  db.prepare(
    "insert into pairings (code_hash, person_id, created_at, expires_at, sealed) values (?,?,?,?,?)"
  ).run(fingerprint(code), personId, now, expires, sealed || null);

  return { code, expiresAt: expires };
}

/**
 * Погасить код: проверить и отметить использованным. Возвращает, чей он и что
 * к нему приложено.
 *
 * Погашение делается ЗАПИСЬЮ С УСЛОВИЕМ, а не «прочитали, проверили,
 * записали»: между чтением и записью помещается второе предъявление того же
 * кода, и оба прошли бы проверку. Для одноразовой вещи это и значит, что она не
 * одноразовая.
 */
function burn(
  db: DatabaseSync,
  code: string,
  now: string
): { personId: string; login: string; sealed: string } {
  return burnHash(db, fingerprint(code), now);
}

function burnHash(
  db: DatabaseSync,
  hash: string,
  now: string
): { personId: string; login: string; sealed: string } {
  sweepPairings(db, now);

  const row = db
    .prepare("select person_id, used_at, expires_at, sealed from pairings where code_hash = ?")
    .get<{
      person_id: string;
      used_at: string | null;
      expires_at: string;
      sealed: string | null;
    }>(hash);

  if (!row) throw new AuthError(404, "Код не найден. Он живёт пять минут — попросите новый.");
  if (row.used_at) {
    throw new AuthError(410, "Этот код уже использован. Попросите на первом устройстве новый.");
  }
  if (row.expires_at < now) {
    throw new AuthError(410, "Код истёк. Он живёт пять минут — попросите новый.");
  }

  const burned = db
    .prepare(
      "update pairings set used_at = ?, sealed = null where code_hash = ? and used_at is null"
    )
    .run(now, hash);
  if (burned.changes === 0) {
    throw new AuthError(410, "Этот код уже использован. Попросите на первом устройстве новый.");
  }

  const person = db
    .prepare("select login from people where id = ?")
    .get<{ login: string }>(row.person_id);
  if (!person) throw new AuthError(404, "Код не найден. Он живёт пять минут — попросите новый.");

  return { personId: row.person_id, login: person.login, sealed: row.sealed ?? "" };
}

/**
 * Предъявить код — прежний путь: узнать имя входа, пароль человек введёт сам.
 * Остаётся для приложений, выпущенных до связки по картинке.
 */
export function redeemPairing(db: DatabaseSync, code: string, now: string): { login: string } {
  return { login: burn(db, code, now).login };
}

/**
 * Войти по коду — новый путь, без имени и пароля.
 *
 * Код погашается, и новому устройству тут же заводится СВОЙ билет: вход ему
 * больше не нужен. Пакет отдаётся как лежал и из базы стирается — служба его
 * не открывала и открыть не может: то, чем он запечатан, есть только в
 * картинке QR, а картинка на службу не приезжает.
 */
export function joinPairing(
  db: DatabaseSync,
  code: string,
  now: string,
  device: string
): JoinAnswer {
  return enter(db, burn(db, code, now), now, device);
}

export type JoinAnswer = { login: string; sealed: string; token: string; deviceId: string | null };

function enter(
  db: DatabaseSync,
  burned: { personId: string; login: string; sealed: string },
  now: string,
  device: string
): JoinAnswer {
  const session = openSession(db, burned.personId, device || undefined, now);
  return { login: burned.login, sealed: burned.sealed, ...session };
}

// ——— обратная связка ———————————————————————————————————————————————————————
//
// Прямая связка требует камеры у НОВОГО устройства: оно снимает картинку с
// экрана старого. Но новым чаще оказывается компьютер — человек начал на
// телефоне, а потом захотел и на ПК, — и камеры у компьютера нет. Тогда
// картинку показывает компьютер, а снимает её телефон с данными:
//
//   1. новое устройство открывает запрос (без входа) и получает билет;
//      в картинку кладёт билет и одноразовый ключ пакета;
//   2. устройство с данными снимает картинку, запечатывает пакет этим ключом
//      и отвечает на билет — обычным `POST /pairing` со своим входом;
//   3. новое устройство, спрашивая по билету, получает пакет и свой вход.
//
// Служба и здесь не видит ключа пакета: он только в картинке. Билет — 256
// случайных бит, перебирать его бессмысленно; в базе лежит хешем.

/** Билет обратной связки: 32 случайных байта, в картинке — base64url. */
const TICKET = /^[A-Za-z0-9_-]{43}$/;

function ticketHash(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

function requestRow(db: DatabaseSync, ticket: string, now: string): { code_hash: string | null } {
  const lost = "Код с нового устройства не найден. Покажите на нём новый.";
  if (!TICKET.test(ticket)) throw new AuthError(404, lost);
  const row = db
    .prepare("select expires_at, code_hash from pair_requests where ticket_hash = ?")
    .get<{ expires_at: string; code_hash: string | null }>(ticketHash(ticket));
  if (!row) throw new AuthError(404, lost);
  if (row.expires_at < now) {
    throw new AuthError(410, "Код на новом устройстве истёк. Покажите на нём новый.");
  }
  return row;
}

/** Шаг 1: новое устройство открывает запрос. */
export function openRequest(db: DatabaseSync, now: string): { ticket: string; expiresAt: string } {
  sweepPairings(db, now);
  const ticket = randomBytes(32).toString("base64url");
  const expires = new Date(Date.parse(now) + LIVES_MS).toISOString();
  db.prepare("insert into pair_requests (ticket_hash, created_at, expires_at) values (?,?,?)").run(
    ticketHash(ticket),
    now,
    expires
  );
  return { ticket, expiresAt: expires };
}

/** Шаг 2: устройство с данными отвечает на запрос запечатанным пакетом. */
export function answerRequest(
  db: DatabaseSync,
  personId: string,
  now: string,
  sealed: string,
  ticket: string
): IssuedCode {
  const row = requestRow(db, ticket, now);
  if (row.code_hash) {
    throw new AuthError(410, "На этот код уже ответили. Покажите на новом устройстве новый.");
  }
  const issued = issuePairing(db, personId, now, sealed);
  // Запись с условием — по той же причине, что и в burn: два ответа подряд
  // на один билет не должны пройти оба.
  const took = db
    .prepare("update pair_requests set code_hash = ? where ticket_hash = ? and code_hash is null")
    .run(fingerprint(issued.code), ticketHash(ticket));
  if (took.changes === 0) {
    throw new AuthError(410, "На этот код уже ответили. Покажите на новом устройстве новый.");
  }
  return issued;
}

/**
 * Шаг 3: новое устройство спрашивает, ответили ли. Пока нет — null. Ответили —
 * запрос гасится, и устройство входит так же, как по прямой связке.
 */
export function pollRequest(
  db: DatabaseSync,
  ticket: string,
  now: string,
  device: string
): JoinAnswer | null {
  const row = requestRow(db, ticket, now);
  if (!row.code_hash) return null;
  const gone = db
    .prepare("delete from pair_requests where ticket_hash = ? and code_hash = ?")
    .run(ticketHash(ticket), row.code_hash);
  if (gone.changes === 0) throw new AuthError(410, "Этот код уже использован.");
  return enter(db, burnHash(db, row.code_hash, now), now, device);
}
