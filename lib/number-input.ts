/**
 * Число из поля ввода, как его набирает человек: «66,7», «1 000,5» (пробел или
 * неразрывный пробел между разрядами). Пусто или не число — null.
 *
 * `Number(...)` здесь не годится дважды: «66,7» для него NaN — доля участника
 * молча пропадала, — а пустая строка — 0, и пустое поле сигнала создавало
 * сигнал на нуле.
 */
export function parseDecimalInput(text: string): number | null {
  const normalized = String(text ?? "")
    .replace(/[\s ]/g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
