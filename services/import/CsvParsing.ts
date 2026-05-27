import { isValid, parse } from "date-fns";

export function parseImportedAmount(raw: unknown) {
  const normalized = String(raw ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!/\d/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
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
