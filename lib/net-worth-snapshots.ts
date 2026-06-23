// Persisted daily net-worth snapshots (plan B7). Unlike the flow-reconstructed
// trend, a snapshot captures the ACTUAL net worth on a day — including portfolio
// market value at that time — so the history is accurate going forward instead
// of approximated from cash flows. Shared by desktop (LocalState) and web (Prisma).

export type NetWorthSnapshot = { date: string; value: number }; // date = YYYY-MM-DD (local)

// Local YYYY-MM-DD (avoids the UTC shift of toISOString around midnight).
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Append today's snapshot, or replace it if one already exists for that day
// (net worth can change during the day). Kept sorted ascending and capped.
export function recordSnapshot(
  snapshots: NetWorthSnapshot[],
  date: string,
  value: number,
  maxEntries = 400
): NetWorthSnapshot[] {
  const next = snapshots.filter((s) => s.date !== date);
  next.push({ date, value });
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.slice(-maxEntries);
}

// The most recent snapshot on or before the given day, or null.
export function snapshotAsOf(
  snapshots: NetWorthSnapshot[],
  isoDate: string
): NetWorthSnapshot | null {
  let best: NetWorthSnapshot | null = null;
  for (const s of snapshots) {
    if (s.date <= isoDate && (!best || s.date > best.date)) best = s;
  }
  return best;
}
