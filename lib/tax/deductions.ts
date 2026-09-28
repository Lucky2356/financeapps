// Налоговый вычет: сколько можно вернуть за год.
//
// Лечение, обучение, спорт, обучение детей, взносы на ИИС — за всё это
// государство возвращает 13 % потраченного, но в пределах лимитов и не больше
// уплаченного за год НДФЛ. Люди об этом забывают или думают, что «там копейки»,
// а это до 19 500 ₽ за лечение и ещё 52 000 ₽ за ИИС.
//
// Лимиты — с 2024 года (ст. 219 и 219.1 НК РФ):
//   социальный (лечение, своё обучение, спорт) — 150 000 ₽ вместе;
//   обучение детей — 110 000 ₽ на каждого ребёнка;
//   ИИС типа А — 400 000 ₽ взносов.
// Дорогостоящее лечение лимита не имеет — оно отдельным видом.
// Ставка — 13 % (15 % с дохода свыше 5 млн — здесь не учитывается: для
// подсказки «сколько примерно вернут» это честное упрощение, оно сказано на
// экране).

export const DEDUCTION_KINDS = [
  "MEDICAL",
  "EXPENSIVE_MEDICAL",
  "EDUCATION",
  "SPORT",
  "CHILD_EDUCATION",
  "IIS"
] as const;
export type DeductionKind = (typeof DEDUCTION_KINDS)[number];

export const SOCIAL_LIMIT = 150_000;
export const CHILD_EDUCATION_LIMIT = 110_000;
export const IIS_LIMIT = 400_000;
export const TAX_RATE = 0.13;

export function isDeductionKind(value: unknown): value is DeductionKind {
  return typeof value === "string" && (DEDUCTION_KINDS as readonly string[]).includes(value);
}

export type DeductionSpend = {
  id: string;
  date: string;
  amount: number;
  kind: DeductionKind;
  description: string | null;
  category: string;
};

export type DeductionLine = {
  /** SOCIAL — лечение, своё обучение и спорт под одним лимитом. */
  group: "SOCIAL" | "EXPENSIVE_MEDICAL" | "CHILD_EDUCATION" | "IIS";
  spent: number;
  limit: number | null;
  counted: number;
  refund: number;
};

export type DeductionYear = {
  year: number;
  lines: DeductionLine[];
  /** Сколько вернут по расходам без потолка НДФЛ. */
  possible: number;
  /** Уплаченный НДФЛ — потолок возврата. null — неизвестно. */
  taxPaid: number | null;
  refund: number;
  /** Не хватает уплаченного налога, чтобы вернуть всё. */
  cappedByTax: boolean;
};

const round = (value: number) => Math.round(value);

export function deductionYear(input: {
  year: number;
  spends: readonly DeductionSpend[];
  taxPaid: number | null;
  children?: number;
}): DeductionYear {
  const prefix = String(input.year);
  const sum = (kinds: DeductionKind[]) =>
    input.spends
      .filter((spend) => spend.date.startsWith(prefix) && kinds.includes(spend.kind))
      .reduce((total, spend) => total + spend.amount, 0);

  const children = Math.max(1, Math.floor(input.children ?? 1));
  const line = (
    group: DeductionLine["group"],
    spent: number,
    limit: number | null
  ): DeductionLine => {
    const counted = limit === null ? spent : Math.min(spent, limit);
    return {
      group,
      spent: round(spent),
      limit,
      counted: round(counted),
      refund: round(counted * TAX_RATE)
    };
  };
  const lines = [
    line("SOCIAL", sum(["MEDICAL", "EDUCATION", "SPORT"]), SOCIAL_LIMIT),
    line("EXPENSIVE_MEDICAL", sum(["EXPENSIVE_MEDICAL"]), null),
    line("CHILD_EDUCATION", sum(["CHILD_EDUCATION"]), CHILD_EDUCATION_LIMIT * children),
    line("IIS", sum(["IIS"]), IIS_LIMIT)
  ].filter((entry) => entry.spent > 0);

  const possible = lines.reduce((total, entry) => total + entry.refund, 0);
  const refund = input.taxPaid === null ? possible : Math.min(possible, Math.max(input.taxPaid, 0));
  return {
    year: input.year,
    lines,
    possible,
    taxPaid: input.taxPaid,
    refund: round(refund),
    cappedByTax: input.taxPaid !== null && possible > input.taxPaid
  };
}

/** Зарплата «на руки» → удержанный НДФЛ: на руки — это 87 %. */
export function taxFromNetSalary(net: number): number {
  return round((net / (1 - TAX_RATE)) * TAX_RATE);
}

/** Для декларации: операции года одним файлом, с ; и BOM — Excel откроет по-русски. */
export function deductionCsv(
  spends: readonly DeductionSpend[],
  year: number,
  labels: Record<DeductionKind, string>
): string {
  const rows = spends
    .filter((spend) => spend.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((spend) =>
      [
        spend.date.slice(0, 10),
        labels[spend.kind],
        spend.category,
        (spend.description ?? "").replace(/[;\n\r]/g, " "),
        spend.amount.toFixed(2).replace(".", ",")
      ].join(";")
    );
  return `﻿Дата;Вид вычета;Категория;Описание;Сумма\n${rows.join("\n")}\n`;
}
