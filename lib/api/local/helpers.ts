// Small pure helpers used by the desktop LocalApiClient router (plan A1).

export function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

// "YYYY-MM" key used to bucket transactions by calendar month (local time).
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function firstOf<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizePath(path: string) {
  const url = new URL(path, "http://local.app");
  return { pathname: url.pathname, searchParams: url.searchParams };
}

export function toFormObject(body: unknown) {
  return Object.fromEntries(
    Object.entries((body ?? {}) as Record<string, unknown>).map(([key, value]) => [
      key,
      firstOf(value as string | string[])
    ])
  ) as Record<string, string>;
}
