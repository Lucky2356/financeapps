import { roundMoney } from "@/lib/utils";

// The one place that decides what a stored operation date looks like.
//
// An operation belongs to a calendar DAY, not to a moment: "продукты, 1 сентября".
// Everything that counts money reads that day off the stored string with
// `slice(0, 7)` / `slice(0, 10)` — budgets, plan/fact, analytics, reports — while
// the list on screen renders the same string in local time. The two agree only
// while the stored timestamp is UTC midnight.
//
// Typing a date into a form produced exactly that ("2026-09-01" parses as UTC
// midnight). Everything the app wrote for itself did not: a Date built in local
// time and serialised with `toISOString()` lands at 17:00 the day BEFORE east of
// Greenwich. A CSV row dated 01.09.2026 was shown as 1 September and counted in
// August; a salary due on the 1st landed in the previous month for every total.
//
// So: the local calendar day in, UTC midnight of that day out.
export function storedTransactionDate(value: string | Date | undefined | null): string {
  if (typeof value === "string") {
    // A plain day is already the answer — no parsing, no timezone in the way.
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (plain) return `${plain[1]}-${plain[2]}-${plain[3]}T00:00:00.000Z`;
  }
  const date = value === undefined || value === null ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) return storedTransactionDate(new Date());
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}

/** The day an already-stored date belongs to, as "YYYY-MM-DD". */
export function storedDay(value: string): string {
  return value.slice(0, 10);
}

/** Today as "YYYY-MM-DD" in the local calendar — the day a person is living in. */
export function todayDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

/** True when a stored date belongs to a day that has not arrived yet. */
export function isFutureDay(value: string, now: Date = new Date()): boolean {
  return storedDay(value) > todayDay(now);
}

/**
 * What the ledger holds ahead of today.
 *
 * An operation dated in the future is counted like any other the moment it is
 * saved: it leaves the account balance and the net worth on the home screen
 * straight away. That is right for someone who deliberately posts an operation
 * forward, and wrong — silently — for someone who typed 2027 instead of 2026.
 * The screen can only say so if somebody counts them, and it has to be counted
 * over the WHOLE ledger: the list opens on the current month, where a row a year
 * out is not merely easy to miss, it is not on the page at all.
 */
export function futureDated(
  rows: Array<{ date: string; amount: number; type: string }>,
  now: Date = new Date()
): { count: number; net: number } {
  let count = 0;
  let net = 0;
  for (const row of rows) {
    if (!isFutureDay(row.date, now)) continue;
    count += 1;
    net += row.type === "INCOME" ? row.amount : -row.amount;
  }
  return { count, net: roundMoney(net) };
}
