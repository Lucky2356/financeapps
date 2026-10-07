/** Полоса таблицы: план, факт или разница между ними. */
export type Band = "plan" | "fact" | "diff";

/** "2026-08" for a date, the same key the plan grid is indexed by. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The first and last day of a "2026-08" month, as the operations list wants them. */
export function monthRange(key: string): { from: string; to: string } {
  const [year, index] = key.split("-").map(Number);
  const last = new Date(year, index, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

/**
 * What the grid hands the dialog when a fact figure is clicked. `pool` — итог
 * одной группы счетов: расшифровка показывает только её операции.
 */
export type DrilldownTarget = {
  title: string;
  subtitle?: string;
  query: string;
  pool?: "main" | "savings";
};
