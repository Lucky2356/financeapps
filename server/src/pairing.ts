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

import { AuthError } from "./auth.ts";
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
export function issuePairing(db: DatabaseSync, personId: string, now: string): IssuedCode {
  sweepPairings(db, now);

  const code = fresh();
  const expires = new Date(Date.parse(now) + LIVES_MS).toISOString();
  db.prepare(
    "insert into pairings (code_hash, person_id, created_at, expires_at) values (?,?,?,?)"
  ).run(fingerprint(code), personId, now, expires);

  return { code, expiresAt: expires };
}

/**
 * Предъявить код. Один раз — и больше никогда.
 *
 * Погашение делается ЗАПИСЬЮ С УСЛОВИЕМ, а не «прочитали, проверили,
 * записали»: между чтением и записью помещается второе предъявление того же
 * кода, и оба прошли бы проверку. Для одноразовой вещи это и значит, что она не
 * одноразовая.
 */
export function redeemPairing(db: DatabaseSync, code: string, now: string): { login: string } {
  sweepPairings(db, now);

  const hash = fingerprint(code);
  const row = db
    .prepare("select person_id, used_at, expires_at from pairings where code_hash = ?")
    .get<{ person_id: string; used_at: string | null; expires_at: string }>(hash);

  if (!row) throw new AuthError(404, "Код не найден. Он живёт пять минут — попросите новый.");
  if (row.used_at) {
    throw new AuthError(410, "Этот код уже использован. Попросите на первом устройстве новый.");
  }
  if (row.expires_at < now) {
    throw new AuthError(410, "Код истёк. Он живёт пять минут — попросите новый.");
  }

  const burned = db
    .prepare("update pairings set used_at = ? where code_hash = ? and used_at is null")
    .run(now, hash);
  if (burned.changes === 0) {
    throw new AuthError(410, "Этот код уже использован. Попросите на первом устройстве новый.");
  }

  const person = db
    .prepare("select login from people where id = ?")
    .get<{ login: string }>(row.person_id);
  if (!person) throw new AuthError(404, "Код не найден. Он живёт пять минут — попросите новый.");

  return { login: person.login };
}
