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

import { createHash, randomInt } from "node:crypto";
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
  sweepPairings(db, now);

  const hash = fingerprint(code);
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
): { login: string; sealed: string; token: string; deviceId: string | null } {
  const burned = burn(db, code, now);
  const session = openSession(db, burned.personId, device || undefined, now);
  return { login: burned.login, sealed: burned.sealed, ...session };
}
