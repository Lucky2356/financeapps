"use client";

// Открыть «Быстрое добавление» снаружи: ярлыком на значке Android («Расход»,
// «Доход», «Сканировать чек») или откуда-то ещё в приложении.
//
// Ярлык приходит при запуске, и неизвестно, что успеет раньше — разбор ссылки
// или сама кнопка быстрого добавления. Поэтому запрос не только рассылается
// событием, но и ждёт здесь: кнопка забирает его, когда появится.

export type QuickAddRequest = { type?: "EXPENSE" | "INCOME"; scanReceipt?: boolean };

export const QUICK_ADD_OPEN = "quick-add-open";

let pending: QuickAddRequest | null = null;

export function requestQuickAdd(request: QuickAddRequest = {}): void {
  pending = request;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUICK_ADD_OPEN));
}

/** Забрать ждущий запрос — один раз. */
export function takeQuickAddRequest(): QuickAddRequest | null {
  const request = pending;
  pending = null;
  return request;
}

/** Ссылка ярлыка → запрос, или null, если это не ярлык. */
export function readShortcutLink(link: string): QuickAddRequest | null {
  if (link.startsWith("financeapps://receipt")) return { type: "EXPENSE", scanReceipt: true };
  const add = /^financeapps:\/\/add(?:\?type=(EXPENSE|INCOME))?$/.exec(link);
  if (add) return { type: (add[1] as "EXPENSE" | "INCOME" | undefined) ?? "EXPENSE" };
  return null;
}

/**
 * Нажатие на напоминание: financeapps://open?path=/budgets → «/budgets».
 * Только путь внутри приложения — никаких чужих адресов.
 */
export function readOpenLink(link: string): string | null {
  const match = /^financeapps:\/\/open\?path=([^&#]*)/.exec(link);
  if (!match) return null;
  const path = decodeURIComponent(match[1]);
  return /^\/(?!\/)[\w\-/?=&.%]*$/.test(path) ? path : null;
}
