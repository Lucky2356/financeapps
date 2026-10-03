// Предложения из уведомлений банка: где лежат, как сливаются, чем записать.
//
// Лежат только на этом телефоне (как черновик быстрого добавления) — в книгу
// попадает лишь то, что человек записал. Сливаются по ключу уведомления;
// старше двух недель и сверх полусотни — забываются: это подсказка «только что
// заплатили», а не архив банка.

import type { BankSuggestion } from "@/lib/bank/notification-parse";
import { matchRule, type CategorizationRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import { loliCategory } from "@/lib/loli/inbox";

export const BANK_SUGGESTIONS_KEY = "bank-suggestions";
export const BANK_ENABLED_KEY = "bank-notifications";
export const BANK_EVENT = "bank-suggestions-changed";
/** Уже записанные или отклонённые — банк может прислать то же уведомление снова. */
export const BANK_HANDLED_KEY = "bank-handled";
const HANDLED_LIMIT = 300;

const KEEP_DAYS = 14;
const LIMIT = 50;

export function parseStored(raw: string | null): BankSuggestion[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (item): item is BankSuggestion =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as BankSuggestion).id === "string" &&
        typeof (item as BankSuggestion).amount === "number" &&
        ((item as BankSuggestion).type === "EXPENSE" || (item as BankSuggestion).type === "INCOME")
    );
  } catch {
    return [];
  }
}

export function parseHandled(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** Запомнить обработанное; самые старые забываются. */
export function addHandled(handled: readonly string[], id: string): string[] {
  return [...handled.filter((item) => item !== id), id].slice(-HANDLED_LIMIT);
}

/**
 * Новые — сверху; одно уведомление — одно предложение; старые уходят. Уже
 * записанное или отклонённое (`handled`) не возвращается, даже если банк
 * обновил своё уведомление и телефон прислал его ещё раз.
 */
export function mergeSuggestions(
  current: readonly BankSuggestion[],
  fresh: readonly BankSuggestion[],
  now: number,
  handled: readonly string[] = []
): BankSuggestion[] {
  const since = now - KEEP_DAYS * 86_400_000;
  const done = new Set(handled);
  const byId = new Map<string, BankSuggestion>();
  for (const item of [...current, ...fresh])
    if (item.at >= since && !done.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, LIMIT);
}

type Ref = { id: string };
type Recorded = { amount: number; date: string; type: string; id?: string };

/** Операции, записанные кнопкой «Записать» из уведомления, — на этом телефоне. */
export const BANK_RECORDED_KEY = "bank-recorded";

function covers(row: Recorded, item: BankSuggestion): boolean {
  const day = Date.parse(`${item.date}T12:00:00`);
  return (
    row.type === item.type &&
    Math.abs(row.amount - item.amount) < 0.005 &&
    Math.abs(Date.parse(`${row.date.slice(0, 10)}T12:00:00`) - day) <= 86_400_000
  );
}

/** Уже записано руками: та же сумма, тот же тип, тот же или соседний день. */
export function alreadyRecorded(item: BankSuggestion, ledger: readonly Recorded[]): boolean {
  return ledger.some((row) => covers(row, item));
}

/**
 * Что ещё ждёт решения. Одна операция в учёте закрывает ОДНО уведомление: два
 * кофе по 200 ₽ за утро — две траты, и записанная первая не должна прятать
 * вторую. Операции, записанные из самих уведомлений (`own`), ничего не
 * закрывают — их уведомление уже убрано, а соседнее того же размера ещё ждёт.
 */
export function pendingSuggestions(
  items: readonly BankSuggestion[],
  ledger: readonly Recorded[],
  own: ReadonlySet<string> = new Set()
): BankSuggestion[] {
  const free = ledger.filter((row) => !row.id || !own.has(row.id));
  const used = new Set<number>();
  const covered = new Set<string>();
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    const index = free.findIndex((row, at) => !used.has(at) && covers(row, item));
    if (index === -1) continue;
    used.add(index);
    covered.add(item.id);
  }
  return items.filter((item) => !covered.has(item.id));
}

/**
 * Куда записать: счёт — с теми же последними цифрами карты в названии, иначе
 * последний, иначе первый; категория — по правилам и прошлым операциям. Нет
 * уверенной категории — null: тогда откроется окно, и человек выберет сам.
 */
export function resolveTarget(
  item: BankSuggestion,
  refs: {
    accounts: Array<Ref & { name: string; isArchived?: boolean; currency?: string }>;
    categories: Array<Ref & { kind: string; label?: string }>;
    rules: CategorizationRule[];
    history: Parameters<typeof suggestCategoryId>[1];
    lastAccount: string | null;
  }
): { accountId: string | null; categoryId: string | null } {
  // Уведомление — в рублях, значит и счёт рублёвый: 450 ₽ на долларовом счёте
  // записались бы как 450 $.
  const accounts = refs.accounts.filter(
    (account) => !account.isArchived && (!account.currency || account.currency === "RUB")
  );
  const byCard = item.card ? accounts.find((account) => account.name.includes(item.card!)) : null;
  const last = accounts.find((account) => account.id === refs.lastAccount);
  const accountId = (byCard ?? last ?? accounts[0])?.id ?? null;

  const known = (id: string | null) =>
    id && refs.categories.some((category) => category.id === id && category.kind === item.type)
      ? id
      : null;
  // Статью назвал сам источник (Лоли: «на продукты») — она и важнее догадки.
  const named = item.category
    ? loliCategory(
        { category: item.category, description: "", type: item.type },
        refs.categories.map((category) => ({ ...category, label: category.label ?? "" })),
        []
      )
    : null;
  if (named) return { accountId, categoryId: named };
  const text = item.merchant;
  const categoryId = text
    ? (known(matchRule(text, refs.rules)) ??
      known(suggestCategoryId(text, refs.history, { type: item.type, rules: refs.rules })))
    : null;
  return { accountId, categoryId };
}
