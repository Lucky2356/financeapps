// Разбор одной строки в черновик операции: «1200 продукты картой» — это сумма,
// категория и счёт, набранные одним движением вместо четырёх полей.
//
// Модуль ничего не решает за человека. Он возвращает разобранное, а диалог
// раскладывает это по видимым полям, которые тут же можно поправить: разбор
// по короткой фразе не может быть безошибочным, и притворяться, что может,
// хуже, чем ошибаться на виду.
//
// Своего здесь мало — почти всё уже написано и проверено:
//   сумма     → calculatedValue (lib/calculator/evaluate.ts): «1 234,56», «3*400»
//   категория → suggestCategoryId (lib/category-suggest.ts): правила + история
//   слова     → normalizeForMatch (lib/text/normalize.ts)
// Своя работа — вытащить из строки то, чего готового нет: знак, дату, теги и
// счёт, и вернуть остаток как описание.

import { calculatedValue } from "@/lib/calculator/evaluate";
import { suggestCategoryId, type SuggestHistoryItem } from "@/lib/category-suggest";
import type { CategorizationRule } from "@/lib/categorization-rules";
import { formatInputDate } from "@/lib/format";
import { normalizeForMatch } from "@/lib/text/normalize";

export type ParsedEntry = {
  amount: number | null;
  /** null — знака не было, тип оставляем тот, что выбран в форме. */
  type: "INCOME" | "EXPENSE" | null;
  accountId: string | null;
  categoryId: string | null;
  /** yyyy-MM-dd или null. */
  date: string | null;
  tags: string[];
  description: string;
};

export type ParseEntryContext = {
  accounts: Array<{ id: string; label: string }>;
  /** Прошлые операции — по ним угадывается категория. */
  history: SuggestHistoryItem[];
  rules?: CategorizationRule[];
  /** Тип, выбранный в форме: он же отбирает историю для подсказки категории. */
  type: "INCOME" | "EXPENSE";
  /** Точка отсчёта для «вчера» и для года у «5 сентября». */
  today: Date;
};

/**
 * Месяцы по основе слова, чтобы одинаково понимать «сентября», «сентябрь» и
 * «сентябре». Основы не пересекаются между собой — кроме мая и марта, которые
 * различаются уже на третьей букве.
 */
const MONTH_STEMS: Array<{ month: number; stems: string[] }> = [
  { month: 1, stems: ["январ"] },
  { month: 2, stems: ["феврал"] },
  { month: 3, stems: ["март"] },
  { month: 4, stems: ["апрел"] },
  { month: 5, stems: ["мая", "май"] },
  { month: 6, stems: ["июн"] },
  { month: 7, stems: ["июл"] },
  { month: 8, stems: ["август"] },
  { month: 9, stems: ["сентябр"] },
  { month: 10, stems: ["октябр"] },
  { month: 11, stems: ["ноябр"] },
  { month: 12, stems: ["декабр"] }
];

const DAY_WORDS: Array<{ word: string; shift: number }> = [
  { word: "позавчера", shift: -2 },
  { word: "вчера", shift: -1 },
  { word: "сегодня", shift: 0 }
];

function shiftDays(from: Date, days: number): Date {
  const moved = new Date(from);
  moved.setDate(moved.getDate() + days);
  return moved;
}

/** Существует ли такой день в таком месяце: 31 февраля датой не считается. */
function realDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/**
 * Год для даты, названной без года: ближайший назад. Иначе «31 декабря»,
 * набранное первого января, уехало бы на год вперёд — в будущее, которого
 * приложение отдельно пугается.
 */
function nearestPastYear(today: Date, month: number, day: number): number | null {
  const thisYear = realDate(today.getFullYear(), month, day);
  if (thisYear && thisYear.getTime() <= today.getTime()) return today.getFullYear();
  const lastYear = realDate(today.getFullYear() - 1, month, day);
  return lastYear ? today.getFullYear() - 1 : null;
}

type Extraction = { value: string | null; rest: string };

/** Вырезает первое совпадение из строки и отдаёт совпавшее вместе с остатком. */
function cut(line: string, pattern: RegExp): Extraction {
  const match = pattern.exec(line);
  if (!match) return { value: null, rest: line };
  return {
    value: match[0],
    rest: (line.slice(0, match.index) + " " + line.slice(match.index + match[0].length)).replace(
      /\s+/g,
      " "
    )
  };
}

/** Слова с решёткой. Сама решётка в тег не попадает. */
function takeTags(line: string): { tags: string[]; rest: string } {
  const tags: string[] = [];
  const rest = line.replace(/#([\p{L}\p{N}_-]+)/gu, (_, tag: string) => {
    tags.push(tag);
    return " ";
  });
  return { tags, rest: rest.replace(/\s+/g, " ").trim() };
}

/**
 * Даты, которые нельзя спутать ни с чем: словом, с явным годом или с названием
 * месяца. Голое «5.09» здесь не разбирается — сначала своё возьмёт сумма.
 */
function takeUnambiguousDate(line: string, today: Date): { date: Date | null; rest: string } {
  return (
    byDayWord(line, today) ??
    byExplicitYear(line) ??
    byMonthName(line, today) ?? {
      date: null,
      rest: line
    }
  );
}

/** «сегодня», «вчера», «позавчера». */
function byDayWord(line: string, today: Date): { date: Date; rest: string } | null {
  for (const { word, shift } of DAY_WORDS) {
    const found = cut(line, new RegExp(`(^|\\s)${word}(?=\\s|$)`, "iu"));
    if (found.value !== null) return { date: shiftDays(today, shift), rest: found.rest.trim() };
  }
  return null;
}

/** «05.09.2025» — год назван, гадать не о чем. */
function byExplicitYear(line: string): { date: Date; rest: string } | null {
  const pattern = /(^|\s)(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?=\s|$)/u;
  const match = pattern.exec(line);
  if (!match) return null;
  const rawYear = Number(match[4]);
  const date = realDate(
    rawYear < 100 ? 2000 + rawYear : rawYear,
    Number(match[3]),
    Number(match[2])
  );
  return date ? { date, rest: cut(line, pattern).rest.trim() } : null;
}

/** «5 сентября» — год берётся ближайший прошедший. */
function byMonthName(line: string, today: Date): { date: Date; rest: string } | null {
  for (const { month, stems } of MONTH_STEMS) {
    for (const stem of stems) {
      const pattern = new RegExp(`(^|\\s)(\\d{1,2})\\s+${stem}[\\p{L}]*(?=\\s|$)`, "iu");
      const match = pattern.exec(line);
      if (!match) continue;
      const day = Number(match[2]);
      const year = nearestPastYear(today, month, day);
      const date = year === null ? null : realDate(year, month, day);
      if (date) return { date, rest: cut(line, pattern).rest.trim() };
    }
  }
  return null;
}

/** Знак перед суммой, если он есть: он и решает, доход это или расход. */
function signOf(raw: string): "+" | "-" | null {
  if (raw.startsWith("+")) return "+";
  if (raw.startsWith("-")) return "-";
  return null;
}

/**
 * Сумма и её знак. Берётся первое число строки вместе с тем, что к нему
 * приклеено арифметикой: «3*400» — это тоже сумма, её умеет калькулятор.
 */
function takeAmount(line: string): {
  amount: number | null;
  type: "INCOME" | "EXPENSE" | null;
  rest: string;
} {
  const pattern = /(^|\s)([+-]?\d[\d\s.,]*(?:[*/×÷x:][\d\s.,]+)*)(?=\s|$)/u;
  const match = pattern.exec(line);
  if (!match) return { amount: null, type: null, rest: line };

  const raw = match[2].trim();
  const sign = signOf(raw);
  const value = calculatedValue(sign ? raw.slice(1) : raw);
  if (value === null || value <= 0) return { amount: null, type: null, rest: line };

  let type: "INCOME" | "EXPENSE" | null = null;
  if (sign === "+") type = "INCOME";
  else if (sign === "-") type = "EXPENSE";

  return { amount: value, type, rest: cut(line, pattern).rest.trim() };
}

/** Голое «5.09» — уже после того, как сумма своё взяла. */
function takeBareDate(line: string, today: Date): { date: Date | null; rest: string } {
  const pattern = /(^|\s)(\d{1,2})[.\-/](\d{1,2})(?=\s|$)/u;
  const match = pattern.exec(line);
  if (!match) return { date: null, rest: line };
  const month = Number(match[3]);
  const day = Number(match[2]);
  const year = nearestPastYear(today, month, day);
  const date = year === null ? null : realDate(year, month, day);
  if (!date) return { date: null, rest: line };
  return { date, rest: cut(line, pattern).rest.trim() };
}

/**
 * Основа слова для сравнения со словами из названия счёта: «картой» и «карта»
 * должны сойтись, а «продукты» и «продажи» — нет. Отсекаются два последних
 * знака, но не короче четырёх: русские окончания короткие, а обрезать до трёх
 * значит склеить половину словаря.
 */
function stem(word: string): string {
  return word.slice(0, Math.max(4, word.length - 2));
}

function sameWord(left: string, right: string): boolean {
  if (left.length < 4 || right.length < 4) return false;
  const a = stem(left);
  const b = stem(right);
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Счёт по слову из строки. Подошло больше одного — не выбираем ничего: молча
 * подставленный чужой счёт хуже, чем невыбранный.
 */
function takeAccount(
  line: string,
  accounts: ParseEntryContext["accounts"]
): { accountId: string | null; rest: string } {
  const words = normalizeForMatch(line).split(" ").filter(Boolean);
  const hits = new Map<string, string>();

  for (const account of accounts) {
    const accountWords = normalizeForMatch(account.label).split(" ").filter(Boolean);
    for (const word of words) {
      if (accountWords.some((accountWord) => sameWord(word, accountWord))) {
        hits.set(account.id, word);
        break;
      }
    }
  }

  if (hits.size !== 1) return { accountId: null, rest: line };
  const [accountId, matchedWord] = [...hits][0];
  // Из описания слово счёта уходит: «продукты картой» — это «продукты».
  const rest = line
    .split(/\s+/)
    .filter((word) => normalizeForMatch(word) !== matchedWord)
    .join(" ")
    .trim();
  return { accountId, rest };
}

/**
 * Разбирает строку в черновик операции. Ничего не бросает: не разобралось —
 * значит поля остаются пустыми, а строка целиком уходит в описание.
 */
export function parseEntry(line: string, context: ParseEntryContext): ParsedEntry {
  const source = line.trim();
  if (!source) {
    return {
      amount: null,
      type: null,
      accountId: null,
      categoryId: null,
      date: null,
      tags: [],
      description: ""
    };
  }

  const withoutTags = takeTags(source);
  const namedDate = takeUnambiguousDate(withoutTags.rest, context.today);
  const amount = takeAmount(namedDate.rest);
  const bareDate = namedDate.date
    ? { date: null, rest: amount.rest }
    : takeBareDate(amount.rest, context.today);
  const account = takeAccount(bareDate.rest, context.accounts);

  const description = account.rest.replace(/\s+/g, " ").trim();
  const date = namedDate.date ?? bareDate.date;

  return {
    amount: amount.amount,
    type: amount.type,
    accountId: account.accountId,
    categoryId: suggestCategoryId(description, context.history, {
      type: amount.type ?? context.type,
      rules: context.rules
    }),
    date: date ? formatInputDate(date) : null,
    tags: withoutTags.tags,
    description
  };
}
