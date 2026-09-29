// Сторож лишних трат — то, что утекает незаметно.
//
// Четыре вещи, которые люди пропускают чаще всего:
//   * подписка подорожала — списание стало больше прошлого;
//   * двойное списание — та же сумма, то же место, тот же счёт за двое суток;
//   * пробный период вот-вот станет платным;
//   * трата сильно больше обычной для своей категории.
//
// Находку можно скрыть («всё верно») — по её ключу, чтобы не всплывала снова.

export type WatchRow = {
  id: string;
  type: "INCOME" | "EXPENSE";
  date: string;
  amount: number;
  description: string | null;
  categoryId: string;
  category: string;
  accountId: string;
  isSubscription?: boolean;
  recurringId?: string | null;
  transferId?: string | null;
  splitGroupId?: string | null;
};

export type WatchTrial = { id: string; name: string; trialEndsOn: string; amount: number };

export type Finding =
  | {
      key: string;
      kind: "priceUp";
      name: string;
      before: number;
      now: number;
      date: string;
      transactionId: string;
    }
  | {
      key: string;
      kind: "duplicate";
      name: string;
      amount: number;
      dates: [string, string];
      transactionIds: [string, string];
    }
  | { key: string; kind: "trial"; name: string; ends: string; amount: number }
  | {
      key: string;
      kind: "unusual";
      name: string;
      category: string;
      amount: number;
      usual: number;
      date: string;
      transactionId: string;
    };

const day = (date: string) => date.slice(0, 10);
const addDays = (date: string, days: number) => {
  const [y, m, d] = day(date).split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
};
const merchant = (text: string | null) =>
  (text ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function findLeaks(input: {
  rows: readonly WatchRow[];
  trials?: readonly WatchTrial[];
  today: string;
  dismissed?: readonly string[];
}): Finding[] {
  const today = day(input.today);
  const dismissed = new Set(input.dismissed ?? []);
  const expenses = input.rows
    .filter((row) => row.type === "EXPENSE" && !row.transferId)
    .sort((a, b) => day(a.date).localeCompare(day(b.date)));
  const findings: Finding[] = [];

  // Подписка подорожала: последние два списания одной подписки.
  const subscriptions = new Map<string, WatchRow[]>();
  for (const row of expenses) {
    if (!row.isSubscription && !row.recurringId) continue;
    const key = row.recurringId ?? `${row.categoryId}|${merchant(row.description)}`;
    subscriptions.set(key, [...(subscriptions.get(key) ?? []), row]);
  }
  for (const rows of subscriptions.values()) {
    if (rows.length < 2) continue;
    const [previous, last] = rows.slice(-2);
    if (day(last.date) < addDays(today, -45)) continue;
    if (last.amount > previous.amount * 1.03 && last.amount - previous.amount >= 10) {
      findings.push({
        key: `priceUp:${last.id}`,
        kind: "priceUp",
        name: last.description || last.category,
        before: previous.amount,
        now: last.amount,
        date: day(last.date),
        transactionId: last.id
      });
    }
  }

  // Двойное списание: одинаковое за двое суток.
  const recent = expenses.filter(
    (row) => day(row.date) >= addDays(today, -30) && !row.splitGroupId
  );
  for (let i = 0; i < recent.length; i += 1) {
    for (let j = i + 1; j < recent.length; j += 1) {
      const a = recent[i];
      const b = recent[j];
      if (day(b.date) > addDays(a.date, 2)) break;
      // Мелочь не в счёт: два кофе за утро — привычка, а не ошибка банка.
      if (
        a.amount >= 500 &&
        a.amount === b.amount &&
        a.accountId === b.accountId &&
        a.categoryId === b.categoryId &&
        merchant(a.description) === merchant(b.description) &&
        !a.recurringId &&
        !b.recurringId
      ) {
        findings.push({
          key: `duplicate:${a.id}:${b.id}`,
          kind: "duplicate",
          name: a.description || a.category,
          amount: a.amount,
          dates: [day(a.date), day(b.date)],
          transactionIds: [a.id, b.id]
        });
      }
    }
  }

  // Пробный период кончается в ближайшие три дня.
  for (const trial of input.trials ?? []) {
    const ends = day(trial.trialEndsOn);
    if (ends >= today && ends <= addDays(today, 3)) {
      findings.push({
        key: `trial:${trial.id}:${ends}`,
        kind: "trial",
        name: trial.name,
        ends,
        amount: trial.amount
      });
    }
  }

  // Трата втрое больше обычной для категории (за последнюю неделю).
  const history = new Map<string, number[]>();
  for (const row of expenses) {
    if (day(row.date) < addDays(today, -97) || day(row.date) >= addDays(today, -7)) continue;
    history.set(row.categoryId, [...(history.get(row.categoryId) ?? []), row.amount]);
  }
  for (const row of expenses) {
    if (day(row.date) < addDays(today, -7)) continue;
    const past = history.get(row.categoryId) ?? [];
    if (past.length < 5) continue;
    const usual = median(past);
    if (row.amount >= 1000 && row.amount >= usual * 3) {
      findings.push({
        key: `unusual:${row.id}`,
        kind: "unusual",
        name: row.description || row.category,
        category: row.category,
        amount: row.amount,
        usual: Math.round(usual),
        date: day(row.date),
        transactionId: row.id
      });
    }
  }

  return findings.filter((finding) => !dismissed.has(finding.key));
}

/** Сразу после записи: не слишком ли крупно для этой категории. */
export function unusualFor(
  row: Pick<WatchRow, "amount" | "categoryId" | "date">,
  history: readonly WatchRow[]
): number | null {
  const past = history
    .filter(
      (item) =>
        item.type === "EXPENSE" &&
        item.categoryId === row.categoryId &&
        day(item.date) >= addDays(row.date, -90) &&
        day(item.date) < day(row.date)
    )
    .map((item) => item.amount);
  if (past.length < 5) return null;
  const usual = median(past);
  return row.amount >= 1000 && row.amount >= usual * 3 ? Math.round(usual) : null;
}
