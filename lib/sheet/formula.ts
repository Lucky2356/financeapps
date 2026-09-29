// Формула в ячейке таблицы бюджета.
//
// Человек переносит сюда таблицу из Excel и печатает так, как привык там:
// «20000», «20 000», «1 500,50», «20000+1500», «=СУММ(1000;2000)», «=SUM(1;2)»,
// «15%» от чего-то вряд ли, но «=45000*13%» — вполне. Всё это считается здесь.
//
// Ссылок на другие ячейки нет нарочно: то, ради чего в Excel пишут ссылки, —
// «Остаток = Итог прошлого месяца», «Итог = СУММ(...)», — таблица считает сама.
// А ссылка вида B7 в приложении, где столбцы двигаются и прячутся, ломалась бы
// молча.

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  SUM: (args) => args.reduce((sum, value) => sum + value, 0),
  СУММ: (args) => args.reduce((sum, value) => sum + value, 0),
  MIN: (args) => Math.min(...args),
  МИН: (args) => Math.min(...args),
  MAX: (args) => Math.max(...args),
  МАКС: (args) => Math.max(...args),
  ROUND: ([value, digits = 0]) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  },
  ОКРУГЛ: ([value, digits = 0]) => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
};

type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "percent" }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "sep" }
  | { kind: "name"; value: string };

class FormulaError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    if (/\s/.test(char)) {
      at += 1;
      continue;
    }
    if (/[0-9.,]/.test(char)) {
      // Число: цифры, пробелы-разделители тысяч внутри («20 000»), десятичная
      // запятая или точка. Пробел — часть числа, только если за ним цифра.
      let raw = "";
      while (at < source.length) {
        const next = source[at];
        if (/[0-9]/.test(next)) raw += next;
        else if (next === "," || next === ".") raw += ".";
        else if (/\s/.test(next) && /[0-9]/.test(source[at + 1] ?? "")) {
          /* разделитель тысяч */
        } else break;
        at += 1;
      }
      if ((raw.match(/\./g) ?? []).length > 1) throw new FormulaError(`Непонятное число «${raw}»`);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new FormulaError(`Непонятное число «${raw}»`);
      tokens.push({ kind: "number", value });
      continue;
    }
    if ("+-*/".includes(char)) {
      tokens.push({ kind: "op", value: char as "+" | "-" | "*" | "/" });
      at += 1;
      continue;
    }
    if (char === "×" || char === "x" || char === "х") {
      tokens.push({ kind: "op", value: "*" });
      at += 1;
      continue;
    }
    if (char === "÷" || char === ":") {
      tokens.push({ kind: "op", value: "/" });
      at += 1;
      continue;
    }
    if (char === "−" || char === "–") {
      tokens.push({ kind: "op", value: "-" });
      at += 1;
      continue;
    }
    if (char === "%") {
      tokens.push({ kind: "percent" });
      at += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "open" });
      at += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "close" });
      at += 1;
      continue;
    }
    if (char === ";") {
      tokens.push({ kind: "sep" });
      at += 1;
      continue;
    }
    if (/[A-Za-zА-Яа-яЁё]/.test(char)) {
      let name = "";
      while (at < source.length && /[A-Za-zА-Яа-яЁё]/.test(source[at])) {
        name += source[at];
        at += 1;
      }
      tokens.push({ kind: "name", value: name.toUpperCase() });
      continue;
    }
    if (char === "₽") {
      at += 1;
      continue;
    }
    throw new FormulaError(`Непонятный знак «${char}»`);
  }
  return tokens;
}

/** Разбор сверху вниз: выражение → слагаемые → множители → число/скобки/функция. */
function parse(tokens: Token[]): number {
  let at = 0;
  const peek = () => tokens[at];

  function expression(): number {
    let value = term();
    for (;;) {
      const token = peek();
      if (token?.kind !== "op" || (token.value !== "+" && token.value !== "-")) return value;
      at += 1;
      const right = term();
      value = token.value === "+" ? value + right : value - right;
    }
  }

  function term(): number {
    let value = factor();
    for (;;) {
      const token = peek();
      if (token?.kind !== "op" || (token.value !== "*" && token.value !== "/")) return value;
      at += 1;
      const right = factor();
      if (token.value === "/" && right === 0) throw new FormulaError("Деление на ноль");
      value = token.value === "*" ? value * right : value / right;
    }
  }

  function factor(): number {
    const token = peek();
    if (!token) throw new FormulaError("Формула оборвалась");
    if (token.kind === "op" && (token.value === "-" || token.value === "+")) {
      at += 1;
      const value = factor();
      return token.value === "-" ? -value : value;
    }
    let value: number;
    if (token.kind === "number") {
      at += 1;
      value = token.value;
    } else if (token.kind === "open") {
      at += 1;
      value = expression();
      if (peek()?.kind !== "close") throw new FormulaError("Не хватает «)»");
      at += 1;
    } else if (token.kind === "name") {
      const fn = FUNCTIONS[token.value];
      if (!fn) throw new FormulaError(`Неизвестная функция «${token.value}»`);
      at += 1;
      if (peek()?.kind !== "open") throw new FormulaError(`После ${token.value} нужна «(»`);
      at += 1;
      const args: number[] = [];
      if (peek()?.kind !== "close") {
        args.push(expression());
        while (peek()?.kind === "sep") {
          at += 1;
          args.push(expression());
        }
      }
      if (peek()?.kind !== "close") throw new FormulaError("Не хватает «)»");
      at += 1;
      value = fn(args);
    } else {
      throw new FormulaError("Лишний знак в формуле");
    }
    while (peek()?.kind === "percent") {
      at += 1;
      value /= 100;
    }
    return value;
  }

  const value = expression();
  if (at < tokens.length) throw new FormulaError("Лишнее в конце формулы");
  return value;
}

/**
 * Посчитать ввод ячейки. Пустой ввод — null (ячейки нет), а не ноль: пустая
 * клетка и клетка с нулём в таблице различаются.
 */
export function evaluate(input: string): FormulaResult | null {
  const trimmed = input.replace(/ /g, " ").trim();
  if (!trimmed) return null;
  const source = trimmed.startsWith("=") ? trimmed.slice(1) : trimmed;
  if (!source.trim()) return null;
  try {
    const value = parse(tokenize(source));
    if (!Number.isFinite(value)) return { ok: false, error: "Не число" };
    return { ok: true, value: Math.round(value * 100) / 100 };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof FormulaError ? cause.message : "Не получилось посчитать"
    };
  }
}

/** Формула ли это (показывать ли «=…» в строке ввода), или просто число. */
export function isFormula(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("=") || /[+*/×÷()%;]|\d\s*[-−]\s*\d/.test(trimmed);
}
