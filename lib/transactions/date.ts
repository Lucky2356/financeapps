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
