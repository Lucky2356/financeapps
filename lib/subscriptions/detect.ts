// Detects likely subscriptions/recurring payments from raw transaction history.
// Pure and deterministic — groups expenses by a normalized merchant name, keeps
// only clusters whose amounts are stable and whose spacing looks periodic
// (weekly / monthly / yearly), and reports each as a candidate the user can turn
// into a real recurring template. Complements lib/subscriptions.ts, which only
// summarizes manually-entered recurring rows.

export type DetectableTransaction = {
  id: string;
  amount: number;
  type: string;
  date: string;
  description?: string | null;
  category?: { id: string; label: string } | null;
};

export type DetectedFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export type DetectedSubscription = {
  /** Stable grouping key (normalized merchant). */
  key: string;
  /** Human-friendly merchant label (most recent original description). */
  merchant: string;
  averageAmount: number;
  frequency: DetectedFrequency;
  occurrences: number;
  /** ISO date of the most recent occurrence. */
  lastDate: string;
  categoryId?: string;
  categoryLabel?: string;
};

// Strips card masks, digits and punctuation so "YANDEX*4121" and "Yandex 5537"
// collapse to the same merchant. Returns "" when nothing meaningful remains.
export function normalizeMerchant(description: string | null | undefined): string {
  if (!description) return "";
  return description
    .toLowerCase()
    .replace(/\[transfer:[^\]]*\]/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function classifyInterval(medianDays: number): DetectedFrequency | null {
  if (medianDays >= 6 && medianDays <= 8) return "WEEKLY";
  if (medianDays >= 25 && medianDays <= 35) return "MONTHLY";
  if (medianDays >= 350 && medianDays <= 380) return "YEARLY";
  return null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type DetectOptions = {
  /** Minimum occurrences to treat a cluster as recurring (default 3). */
  minOccurrences?: number;
  /** Max allowed amount spread relative to the median (default 0.15 = 15%). */
  amountTolerance?: number;
};

export function detectSubscriptions(
  transactions: DetectableTransaction[],
  options: DetectOptions = {}
): DetectedSubscription[] {
  const minOccurrences = options.minOccurrences ?? 3;
  const amountTolerance = options.amountTolerance ?? 0.15;

  const groups = new Map<
    string,
    { merchant: string; date: number; amount: number; category?: { id: string; label: string } }[]
  >();

  for (const transaction of transactions) {
    if (transaction.type !== "EXPENSE") continue;
    const key = normalizeMerchant(transaction.description);
    if (!key) continue;
    const time = new Date(transaction.date).getTime();
    if (Number.isNaN(time)) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push({
      merchant: transaction.description ?? key,
      date: time,
      amount: Math.abs(transaction.amount),
      category: transaction.category ?? undefined
    });
    groups.set(key, bucket);
  }

  const detected: DetectedSubscription[] = [];

  for (const [key, entries] of groups) {
    if (entries.length < minOccurrences) continue;
    entries.sort((a, b) => a.date - b.date);

    const amounts = entries.map((entry) => entry.amount);
    const medianAmount = median(amounts);
    if (medianAmount <= 0) continue;
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / medianAmount;
    if (spread > amountTolerance) continue; // variable spend, not a subscription

    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i += 1) {
      intervals.push((entries[i].date - entries[i - 1].date) / DAY_MS);
    }
    const frequency = classifyInterval(median(intervals));
    if (!frequency) continue;

    const last = entries[entries.length - 1];
    detected.push({
      key,
      merchant: last.merchant,
      averageAmount:
        Math.round((amounts.reduce((sum, a) => sum + a, 0) / amounts.length) * 100) / 100,
      frequency,
      occurrences: entries.length,
      lastDate: new Date(last.date).toISOString(),
      categoryId: last.category?.id,
      categoryLabel: last.category?.label
    });
  }

  return detected.sort((a, b) => b.averageAmount - a.averageAmount);
}
