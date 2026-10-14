// Ячейки: то, ради чего служба существует.
//
// Написано по договору из lib/sync/protocol.ts, и это не фигура речи: договор
// писался раньше и именно как техзадание сюда. Расхождение между этим файлом и
// тем обязано ронять проверки, а не всплывать у человека на телефоне.
//
// Сердце здесь одно — ЗАПИСЬ ТОЛЬКО ПОВЕРХ ИЗВЕСТНОЙ ВЕРСИИ. Устройство
// предъявляет номер версии, поверх которой пишет; совпало — приняли, не
// совпало — отказали и вернули то, что лежит. Отказ не ошибка, а нормальный ход:
// с него начинается слияние на устройстве. Без этого правила два устройства,
// вышедшие в сеть одновременно, затёрли бы работу друг друга молча.

import type { DatabaseSync } from "node:sqlite";

import type { BookRow } from "./db.ts";

/** Сколько может весить одна книга. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024;

/**
 * Сколько всего позволено одному человеку.
 *
 * До открытой регистрации пределов не было вовсе, и это было правильно: на
 * службе сидели десять человек по личным приглашениям, и единственный, кто мог
 * её переполнить, — сам хозяин. С открытой регистрацией это перестаёт быть
 * верным в тот же день: любой желающий заводит себе запись и пишет в неё
 * сколько влезет, пока не кончится диск. Кончившийся диск — это не «медленно»,
 * это остановка службы для ВСЕХ, включая тех, кто ничего не делал.
 *
 * `null` — без предела, и это единственное значение, означающее «не считать».
 * Ноль здесь означал бы ровно ноль: записывать нельзя ничего. Классическая
 * западня «0 = безлимит» не заводится тем, что её негде завести.
 */
export type Limits = {
  /** Сколько ячеек. Ячейка — это профиль: «Личное», «Жена», «Бизнес». */
  slots: number | null;
  /** Сколько всего байт во всех ячейках вместе. */
  bytes: number | null;
};

/** Сегодняшнее поведение: служба на десять своих, считать нечего. */
export const NO_LIMITS: Limits = { slots: null, bytes: null };

export type Snapshot = {
  slot: string;
  version: number;
  body: unknown | null;
  updatedAt: string | null;
};

export function readSlot(db: DatabaseSync, personId: string, slot: string): Snapshot {
  const row = db
    .prepare("select version, body, updated_at from books where person_id = ? and slot = ?")
    .get<Pick<BookRow, "version" | "body" | "updated_at">>(personId, slot);

  if (!row) return { slot, version: 0, body: null, updatedAt: null };
  return {
    slot,
    version: row.version,
    body: JSON.parse(row.body) as unknown,
    updatedAt: row.updated_at
  };
}

/**
 * Перечень ячеек человека — без содержимого.
 *
 * Нужен свежему устройству: иначе оно не знает, что спрашивать, и вторая книга
 * (второй профиль) не доедет до него никогда.
 */
export function listSlots(
  db: DatabaseSync,
  personId: string
): Array<{ slot: string; version: number; updatedAt: string }> {
  return db
    .prepare(
      "select slot, version, updated_at as updatedAt from books where person_id = ? order by slot"
    )
    .all<{ slot: string; version: number; updatedAt: string }>(personId);
}

/**
 * Сколько последних версий каждой ячейки служба помнит — номер и время записи.
 *
 * Зачем. Устройство помнит, какую версию ячейки видело последней, и держит её
 * основой для слияния. Если хозяин службы вернул базу из ночной копии, а
 * другие устройства успели дописать ДАЛЬШЕ того номера, что помнит это, —
 * номер на службе снова больше, и по одному номеру возврат не виден: устройство
 * приняло бы чужую историю за продолжение своей и слило бы с неверной основой
 * (всё написанное им после копии сочлось бы удалённым на службе).
 *
 * Поэтому устройство называет пару «версия + время», которую помнит, а служба
 * отвечает, была ли такая пара в её истории. Копия базы уносит с собой и
 * историю на тот день — значит после возврата пары, записанной позже копии, в
 * истории нет, и это видно сразу.
 *
 * Шестьдесят четыре — с запасом на неделю обычной работы одного человека;
 * строка истории — номер и время, десятки байт. Предел держит таблицу
 * маленькой при любой частоте записи.
 */
export const HISTORY_DEPTH = 64;

/** Что служба знает о паре «версия + время», которую помнит устройство. */
export type Ancestry = "known" | "unknown";

/**
 * Была ли у ячейки такая версия с таким временем записи.
 *
 * `null` — сказать нельзя: пара старше всего, что служба помнит (история
 * короче, или запись сделана до того, как служба начала её вести). Тогда
 * устройство поступает как раньше, по одному номеру.
 */
export function ancestryOf(
  db: DatabaseSync,
  personId: string,
  slot: string,
  known: { version: number; updatedAt: string }
): Ancestry | null {
  const hit = db
    .prepare(
      "select 1 as hit from book_versions where person_id = ? and slot = ? and version = ? and updated_at = ?"
    )
    .get<{ hit: number }>(personId, slot, known.version, known.updatedAt);
  if (hit) return "known";
  const oldest = db
    .prepare("select min(version) as oldest from book_versions where person_id = ? and slot = ?")
    .get<{ oldest: number | null }>(personId, slot)?.oldest;
  // Истории нет вовсе — ячейки на службе нет (вернули копию, сделанную до
  // неё): устройство помнит то, чего служба не видела.
  if (oldest === null || oldest === undefined) return "unknown";
  return known.version < oldest ? null : "unknown";
}

export type PutOutcome =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; reason: "stale"; current: Snapshot }
  | { ok: false; reason: "full"; error: string };

export function writeSlot(
  db: DatabaseSync,
  personId: string,
  slot: string,
  baseVersion: number,
  body: unknown,
  now: string,
  limits: Limits = NO_LIMITS,
  /**
   * Время записи той версии, поверх которой пишет устройство. Необязательное:
   * старые устройства его не шлют, и для них всё как раньше — по одному номеру.
   *
   * С ним «та же пятая» и «другая пятая» различаются и при записи. Другая
   * пятая — это служба, вернувшаяся из копии, поверх которой соседнее
   * устройство дописало до того же номера; принять запись по одному номеру
   * значило бы затереть его работу, не слив.
   */
  baseUpdatedAt: string | null = null
): PutOutcome {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw new Error("Данные не помещаются в отведённый предел.");
  }

  const current = readSlot(db, personId, slot);
  const sameBase =
    current.version === baseVersion &&
    (baseUpdatedAt === null || current.updatedAt === baseUpdatedAt);
  if (!sameBase) return { ok: false, reason: "stale", current };

  const crowded = tooMuch(db, personId, slot, text, limits);
  if (crowded) return { ok: false, reason: "full", error: crowded };

  const version = current.version + 1;
  // Одним запросом, а не «проверить и записать»: между двумя запросами
  // помещается вторая запись того же человека с другого устройства, и обе
  // прошли бы проверку. Условие в самом запросе не оставляет этой щели.
  const written = db
    .prepare(
      `insert into books (person_id, slot, version, body, updated_at)
       values (?, ?, ?, ?, ?)
       on conflict(person_id, slot) do update set
         version = excluded.version,
         body = excluded.body,
         updated_at = excluded.updated_at
       where books.version = ?`
    )
    .run(personId, slot, version, text, now, baseVersion);

  if (written.changes === 0) {
    // Кто-то успел между чтением и записью. Возвращаем свежее.
    return { ok: false, reason: "stale", current: readSlot(db, personId, slot) };
  }

  remember(db, personId, slot, version, now);
  return { ok: true, version, updatedAt: now };
}

/** Записать версию в историю ячейки и забыть то, что старше предела. */
function remember(
  db: DatabaseSync,
  personId: string,
  slot: string,
  version: number,
  updatedAt: string
): void {
  db.prepare(
    "insert or replace into book_versions (person_id, slot, version, updated_at) values (?, ?, ?, ?)"
  ).run(personId, slot, version, updatedAt);
  db.prepare("delete from book_versions where person_id = ? and slot = ? and version <= ?").run(
    personId,
    slot,
    version - HISTORY_DEPTH
  );
}

/**
 * Влезет ли запись в отведённое человеку — и если нет, то что ему сказать.
 *
 * Считается ПОСЛЕ проверки версии и ПЕРЕД самой записью. Порядок тут не
 * вкусовой: откажи предел раньше версии — и человек, которого вдобавок
 * обогнали, узнал бы только про место, сходил бы чистить и вернулся бы к тому
 * же отказу «вас обогнали». Сначала договор, потом хозяйство.
 *
 * Старый размер этой же ячейки ВЫЧИТАЕТСЯ. Иначе человек, упёршийся в предел,
 * не смог бы даже УДАЛИТЬ у себя половину операций: запись меньшего размера
 * поверх большей всё равно считалась бы добавкой, и единственный выход из
 * переполнения оказался бы закрыт тем же переполнением.
 *
 * Отказ возвращается строкой, а не `true`: человеку на экране нужно не «не
 * влезло», а сколько у него есть и сколько он просит.
 */
function tooMuch(
  db: DatabaseSync,
  personId: string,
  slot: string,
  text: string,
  limits: Limits
): string | null {
  if (limits.slots === null && limits.bytes === null) return null;

  const mine = usageOf(db, personId);
  const existing = db.prepare(SIZE_OF_ONE).get<{ bytes: number }>(personId, slot);

  if (limits.slots !== null && !existing && !isAttachment(slot) && mine.slots >= limits.slots) {
    return `На этой службе разрешено ${limits.slots} книг(и) на человека, а у вас уже ${mine.slots}.`;
  }

  if (limits.bytes !== null) {
    const before = existing ? costOf(slot, existing.bytes) : 0;
    const after = mine.bytes - before + costOf(slot, Buffer.byteLength(text));
    if (after > limits.bytes) {
      return (
        `Не хватает места на службе: разрешено ${megabytes(limits.bytes)}, ` +
        `а эта запись довела бы до ${megabytes(after)}.`
      );
    }
  }

  return null;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МиБ`;
}

/**
 * Размер — В БАЙТАХ, а не в знаках, и `cast(... as blob)` здесь именно за этим.
 *
 * `length()` у SQLite считает текст ЗНАКАМИ. Для латиницы это одно и то же, и
 * разницу не видно вовсе; для кириллицы знак весит два байта, и служба
 * насчитала бы человеку ровно вдвое меньше занятого. Предел, выставленный
 * хозяином в мегабайтах, пропускал бы вдвое больше — а сверял бы он его по
 * `df`, который считает байты.
 *
 * Поймано первой же проверкой, которая записала кириллицу: предел в 4 КиБ
 * отказал записи, которую сам же считал влезающей. Латиница прошла бы молча, и
 * расхождение всплыло бы на живой машине как «место кончилось вдвое раньше
 * обещанного».
 *
 * Приведение к blob делается вместо `octet_length()` нарочно: та появилась в
 * SQLite 3.43, а служба ходит на той библиотеке, что встроена в Node у
 * хозяина, — и падать на старой из-за красоты запроса ей незачем.
 */
const SIZE_OF_ONE =
  "select length(cast(body as blob)) as bytes from books where person_id = ? and slot = ?";

/**
 * Фото чеков — каждое своей ячейкой (приложение, lib/photos/receipt-photo.ts).
 * Предел «сколько книг» про тетрадки, а не про чеки: пять фото не должны
 * запирать шестую книгу. Место они при этом занимают честно и в предел по
 * мегабайтам входят.
 */
export const ATTACHMENT_MARK = "receiptPhoto_";

/**
 * Имя ячейки фото — ровно то, что строит приложение: `receiptPhoto_<id
 * операции>`, с приставкой В НАЧАЛЕ.
 *
 * Раньше хватало, чтобы приставка встречалась где угодно: `slot.includes`.
 * Ячейка `книга-1-receiptPhoto_` числилась фото, и предел «две книги на
 * человека» обходился дописыванием этих тринадцати знаков к любому имени —
 * проверка нашла полсотни «книг» у человека с пределом в две. Пробелы и `/`
 * в id операции приложение не кладёт, длину держит предел имени ячейки.
 */
const ATTACHMENT_SLOT = /^receiptPhoto_[^\s/]{1,128}$/;

export function isAttachment(slot: string): boolean {
  return ATTACHMENT_SLOT.test(slot);
}

/**
 * Во что обходится службе одна ячейка сверх содержимого: строка в таблице,
 * запись в указателе по (человек, ячейка), номер версии и время записи.
 *
 * Без этого место считалось одним содержимым, и фото с телом из одного байта
 * не стоило почти ничего: имя ячейки в двести знаков и служебная часть строки
 * в предел не входили вовсе, и мелкими ячейками базу можно было раздувать
 * сколько угодно при любом пределе по мегабайтам.
 */
export const ROW_OVERHEAD_BYTES = 256;

/** Сколько ячейка занимает с учётом имени и служебной части строки. */
function costOf(slot: string, bodyBytes: number): number {
  return bodyBytes + Buffer.byteLength(slot) + ROW_OVERHEAD_BYTES;
}

/**
 * Сколько места занимают книги человека — для страницы управления и для
 * пределов.
 *
 * Разбор «фото или книга» делается ЗДЕСЬ, тем же isAttachment, что и при
 * проверке предела, а не отдельным условием в запросе. Два разных правила —
 * одно в SQL, другое в коде — однажды разошлись бы, и ячейка, которую запись
 * считает книгой, а подсчёт фото, проходила бы предел книг бесконечно.
 */
export function usageOf(db: DatabaseSync, personId: string): { slots: number; bytes: number } {
  const rows = db
    .prepare("select slot, length(cast(body as blob)) as bytes from books where person_id = ?")
    .all<{ slot: string; bytes: number }>(personId);
  let slots = 0;
  let bytes = 0;
  for (const row of rows) {
    if (!isAttachment(row.slot)) slots += 1;
    bytes += costOf(row.slot, row.bytes);
  }
  return { slots, bytes };
}
