// Что лежит в картинке QR — и что понимает поле ввода.
//
// ОДИН РАЗБОРЩИК НА ОБА ПУТИ. Человек либо наводит камеру, либо набирает код
// руками, и оба раза приложению достаётся строка. Заведи мы два способа её
// понять — они однажды разойдутся, и разойдутся молча: набранное вручную
// работает, снятое камерой нет, а выглядит это как «камера не читает».
//
// КЛЮЧ ОТ ПАКЕТА — ЕСТЬ (с версии 2.0). Параметр `k`: одноразовый ключ,
// которым запечатан пакет связки на службе (см. lib/sync/pair-package). Это не
// пароль и не ключ от данных: он открывает один пакет, один раз и пять минут.
// Без него второе устройство идёт прежним путём — имя и пароль.
//
// ЧЕГО В КАРТИНКЕ НЕТ — ПАРОЛЯ. Решение владельца, и оно правильное вдвойне
// именно здесь: картинку снимают из-за плеча, пересылают в мессенджере и
// оставляют на экране, отойдя за чаем. Пароль — единственное, чем завёрнут
// ключ от данных; поехав в QR, он сделал бы бессмысленным всё шифрование.
//
// ПОЧЕМУ АДРЕС ВСЁ-ТАКИ ЕДЕТ. Без него код бесполезен тому, у кого своя
// служба: кода мало, надо ещё знать, у кого его спрашивать. Цена названа
// прямо: подсунутая картинка уводит приложение на чужой адрес. Поэтому
// адрес, приехавший снаружи, ПОКАЗЫВАЕТСЯ человеку до того, как он введёт
// пароль, — ровно тем же экраном, что и при наборе кода руками. Молча
// подключаться к тому, что принесла картинка, приложение не станет.

/** Своя схема: эту ссылку понимает только приложение, и открывать её некому. */
const SCHEME = "financeapps:";

/** Те же 32 знака, что выдаёт служба, — без похожих друг на друга. */
const ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export type Pairing = {
  /** Адрес службы. null — в строке его не было; берём тот, что уже знаем. */
  base: string | null;
  /** Код прямой связки. Пустой у картинки НОВОГО устройства (см. ticket). */
  code: string;
  /** Ключ от пакета связки. null — старая картинка или код набран руками. */
  key: string | null;
  /**
   * Билет обратной связки: картинку показывает НОВОЕ устройство, а снимает
   * устройство с данными. null — обычная, прямая картинка.
   */
  ticket: string | null;
};

/** 32 байта в base64url — 43 знака без добивки. */
const KEY = /^[A-Za-z0-9_-]{43}$/;

/** Код к общему виду: как ни набери — одно и то же. */
export function tidyCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

/** Что кладём в картинку. */
export function makePairingLink(base: string, code: string, key?: string): string {
  const clean = base.trim().replace(/\/+$/, "");
  const sealedWith = key ? `&k=${key}` : "";
  return `${SCHEME}//pair?s=${encodeURIComponent(clean)}&c=${tidyCode(code)}${sealedWith}`;
}

/**
 * Картинка НОВОГО устройства (обратная связка): его снимает устройство, где
 * данные уже есть, и отвечает пакетом, запечатанным ключом `k`.
 */
export function makeRequestLink(base: string, ticket: string, key: string): string {
  const clean = base.trim().replace(/\/+$/, "");
  return `${SCHEME}//pair?s=${encodeURIComponent(clean)}&r=${ticket}&k=${key}`;
}

/**
 * Понять, что принесли, — ссылкой из картинки или восемью знаками с клавиатуры.
 *
 * Возвращает null, а не бросает: сюда приезжает что угодно — чужой QR с
 * рекламой, обрывок ссылки, пустая строка. Это не ошибка приложения, а обычный
 * ход, и человеку про него говорит экран, а не исключение.
 */
export function readPairing(raw: string): Pairing | null {
  const text = raw.trim();
  if (!text) return null;

  // Сначала — простой случай: человек набрал или снял одни только знаки.
  const bare = tidyCode(text);
  if (ALPHABET.test(bare)) return { base: null, code: bare, key: null, ticket: null };

  if (!text.toLowerCase().startsWith(SCHEME)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.hostname !== "pair" && url.pathname.replace(/^\/+/, "") !== "pair") return null;

  const ticket = (url.searchParams.get("r") ?? "").trim();
  if (ticket && !KEY.test(ticket)) return null;
  const code = ticket ? "" : tidyCode(url.searchParams.get("c") ?? "");
  if (!ticket && !ALPHABET.test(code)) return null;

  const address = (url.searchParams.get("s") ?? "").trim().replace(/\/+$/, "");
  // Адрес принимается ТОЛЬКО по https. Подсунутая картинка с http увела бы
  // и код, и выведенный из пароля секрет входа открытым текстом.
  if (address && !/^https:\/\/[^/\s]+/i.test(address)) return null;

  const key = (url.searchParams.get("k") ?? "").trim();
  if (key && !KEY.test(key)) return null;
  // Картинке нового устройства без ключа отвечать нечем.
  if (ticket && !key) return null;

  return { base: address || null, code, key: key || null, ticket: ticket || null };
}
