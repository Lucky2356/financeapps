// Траты от Лоли — голосового помощника (github.com/Lucky2356/loli_ai).
//
// «Лоли, потратила 850 на продукты» → Android-окно LoliProvider кладёт трату в
// очередь (LoliBridge.kt) → страница забирает её отсюда. Дальше два пути, на
// выбор человека в настройках:
//   * в «Подсказки» на главной — рядом с тратами из уведомлений банка, одним
//     нажатием «Записать»;
//   * сразу в учёт («Записывать сразу») — Лоли и так переспрашивает, если не
//     поняла.
// У каждой траты Лоли свой номер. По нему правка («не 850, а 950») и отмена
// («отмени последнее») находят ту самую операцию, а присланное дважды не
// задваивается.
//
// Здесь — чистые функции; ходит в учёт components/loli/loli-watch.tsx.

import type { BankSuggestion } from "@/lib/bank/notification-parse";
import { suggestCategoryId } from "@/lib/category-suggest";

export type LoliItem =
  | {
      id: string;
      op: "upsert";
      type: "EXPENSE" | "INCOME";
      /** В копейках (центах) — как хранит Лоли. */
      amountMinor: number;
      currency: string;
      category: string;
      description: string;
      /** YYYY-MM-DD */
      date: string;
      at: number;
    }
  | { id: string; op: "delete"; at: number };

/** Номер операции в учёте по номеру траты в Лоли — на этом устройстве. */
export const LOLI_LINKS_KEY = "loli-links";
/** Предложение из Лоли среди «Подсказок» узнаётся по этому началу номера. */
export const LOLI_PREFIX = "loli:";
const LINKS_LIMIT = 500;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9-]{1,64}$/;

export function parseLoliQueue(raw: string | null | undefined): LoliItem[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: LoliItem[] = [];
  for (const value of list) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const id = String(item.id ?? "");
    const at = Number(item.at) || 0;
    if (!ID.test(id)) continue;
    if (item.op === "delete") {
      out.push({ id, op: "delete", at });
      continue;
    }
    const amountMinor = Number(item.amountMinor);
    const date = String(item.date ?? "");
    const type = item.type === "INCOME" ? "INCOME" : "EXPENSE";
    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || !DAY.test(date)) continue;
    out.push({
      id,
      op: "upsert",
      type,
      amountMinor: Math.round(amountMinor),
      currency: /^[A-Z]{3}$/.test(String(item.currency)) ? String(item.currency) : "RUB",
      category: String(item.category ?? "").slice(0, 100),
      description: String(item.description ?? "").slice(0, 500),
      date,
      at
    });
  }
  return out;
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();

type CategoryRef = { id: string; label: string; kind: string };
type HistoryRow = Parameters<typeof suggestCategoryId>[1][number];

/**
 * Статья учёта для категории, которую назвала Лоли. Сначала — по названию
 * («Продукты» = «продукты»), потом — по началу слова («Транспорт» ↔ «транспорт
 * и такси»), потом — по прошлым операциям с тем же описанием. Не нашлось —
 * null: тогда трата идёт в «Подсказки», и статью выберет человек.
 */
export function loliCategory(
  item: { category: string; description: string; type: "EXPENSE" | "INCOME" },
  categories: readonly CategoryRef[],
  history: readonly HistoryRow[]
): string | null {
  const own = categories.filter((category) => category.kind === item.type);
  const wanted = normal(item.category);
  if (wanted) {
    const exact = own.find((category) => normal(category.label) === wanted);
    if (exact) return exact.id;
    const stem = wanted.slice(0, Math.max(4, Math.min(6, wanted.length)));
    const close = own.find((category) => {
      const label = normal(category.label);
      return label.startsWith(stem) || wanted.startsWith(label.slice(0, 6));
    });
    if (close) return close.id;
    // По общему слову: у Лоли «Кафе и рестораны», «Дом и ЖКХ», здесь —
    // «Рестораны», «ЖКХ». Слово узнаётся по началу: «ресторан» = «рестораны».
    const words = (text: string) =>
      normal(text)
        .split(" ")
        .filter((word) => word.length >= 3);
    const mine = words(item.category);
    const shared = own.find((category) =>
      words(category.label).some((word) =>
        mine.some((other) => {
          const size = Math.min(5, word.length, other.length);
          return word.slice(0, size) === other.slice(0, size) && size >= 3;
        })
      )
    );
    if (shared) return shared.id;
  }
  const text = item.description || item.category;
  if (!text) return null;
  const suggested = suggestCategoryId(text, [...history], { type: item.type });
  return suggested && own.some((category) => category.id === suggested) ? suggested : null;
}

/** Счёт для траты Лоли: в той же валюте; последний, которым платили, — первым. */
export function loliAccount(
  currency: string,
  accounts: ReadonlyArray<{ id: string; currency?: string; isArchived?: boolean }>,
  lastAccount: string | null
): string | null {
  const same = accounts.filter(
    (account) => !account.isArchived && (account.currency ?? "RUB") === currency
  );
  return (same.find((account) => account.id === lastAccount) ?? same[0])?.id ?? null;
}

/** Трата Лоли — предложением в «Подсказках». */
export function loliSuggestion(item: Extract<LoliItem, { op: "upsert" }>): BankSuggestion {
  const what = item.description || item.category;
  return {
    id: `${LOLI_PREFIX}${item.id}`,
    type: item.type,
    amount: Math.round(item.amountMinor) / 100,
    merchant: what,
    card: null,
    date: item.date,
    at: item.at || Date.now(),
    app: "Лоли",
    source: `Лоли: ${[item.category, item.description].filter(Boolean).join(" — ")}`,
    category: item.category || undefined
  };
}

export function parseLinks(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

/** Запомнить связь; самые старые забываются — правят обычно последнее. */
export function withLink(
  links: Record<string, string>,
  loliId: string,
  transactionId: string | null
): Record<string, string> {
  const next = { ...links };
  delete next[loliId];
  if (transactionId) next[loliId] = transactionId;
  const entries = Object.entries(next);
  return Object.fromEntries(entries.slice(-LINKS_LIMIT));
}
