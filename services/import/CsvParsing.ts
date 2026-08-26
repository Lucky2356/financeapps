import { isValid, parse } from "date-fns";

export function parseImportedAmount(raw: unknown) {
  // Statements write the same number four ways: "1 234,56", "1.234,56",
  // "1,234.56", "-1 234.56 ₽". Replacing the first comma and hoping was enough
  // for the first of those; the others became NaN and the row was dropped
  // without a word. So: strip everything that is not a digit or a separator,
  // then decide which separator was the decimal one — the LAST one, when what
  // follows it is one or two digits; otherwise the number is whole.
  const cleaned = String(raw ?? "")
    .replace(/\s/g, "")
    // A typographic minus (‒ – — ―, −) is still a minus.
    .replace(/[‒-―−]/g, "-")
    .replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-") || cleaned.endsWith("-");
  const digits = cleaned.replace(/-/g, "");
  const lastSeparator = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
  const decimals = lastSeparator >= 0 ? digits.length - lastSeparator - 1 : 0;
  const normalized =
    lastSeparator >= 0 && decimals >= 1 && decimals <= 2
      ? `${digits.slice(0, lastSeparator).replace(/[.,]/g, "")}.${digits.slice(lastSeparator + 1)}`
      : digits.replace(/[.,]/g, "");

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function parseImportedDate(raw: unknown) {
  const value = String(raw ?? "").trim();
  const formats = ["dd.MM.yyyy", "yyyy-MM-dd", "dd/MM/yyyy"];

  for (const format of formats) {
    const parsed = parse(value, format, new Date());
    if (isValid(parsed)) return parsed;
  }

  const native = new Date(value);
  return isValid(native) ? native : null;
}
