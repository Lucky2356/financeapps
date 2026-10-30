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

/**
 * Округлить до `digits` знаков, как Excel: половина — от нуля. Через запись
 * числа, а не умножением: 1,005 в двоичном виде чуть меньше себя, и
 * Math.round(1,005 × 100) давал 1,00 вместо 1,01, а −0,125 — −0,12 вместо −0,13.
 */
export function roundHalfAway(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const scaled = Math.round(shiftDecimal(Number(Math.abs(value).toPrecision(15)), digits));
  const result = shiftDecimal(scaled, -digits);
  return result === 0 ? 0 : Math.sign(value) * result;
}

/**
 * Умножить на 10^by через запись числа, без ошибки двоичной дроби.
 *
 * Порядок прибавляется к уже имеющемуся, а не дописывается вторым «e»:
 * очень малые и очень большие числа JavaScript пишет сам в виде «5.55e-17»,
 * и прежнее «5.55e-17e2» было NaN. Так «0,1+0,2−0,3» (остаток 5,55e-17 от
 * двоичных дробей) превращал итог месяца в «не число» — а за ним и все
 * следующие месяцы, куда итог переносится остатком.
 */
function shiftDecimal(value: number, by: number): number {
  const [mantissa, exponent = "0"] = String(value).split("e");
  return Number(`${mantissa}e${Number(exponent) + by}`);
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  SUM: (args) => args.reduce((sum, value) => sum + value, 0),
  СУММ: (args) => args.reduce((sum, value) => sum + value, 0),
  // Циклом, а не Math.min(...args): диапазон свободного листа бывает в сотни
  // тысяч чисел, и разворот в аргументы падал с RangeError. Пустой — ноль, как
  // в Excel.
  MIN: (args) => (args.length ? args.reduce((low, value) => Math.min(low, value)) : 0),
  МИН: (args) => (args.length ? args.reduce((low, value) => Math.min(low, value)) : 0),
  MAX: (args) => (args.length ? args.reduce((high, value) => Math.max(high, value)) : 0),
  МАКС: (args) => (args.length ? args.reduce((high, value) => Math.max(high, value)) : 0),
  ROUND: ([value, digits = 0]) => roundHalfAway(value, digits),
  ОКРУГЛ: ([value, digits = 0]) => roundHalfAway(value, digits),
  // Для диапазонов свободного листа (см. free-grid.ts): среднее и сколько
  // чисел. Среднее пустого — ошибка (деления на ноль), как #ДЕЛ/0! в Excel.
  AVERAGE: (args) => args.reduce((sum, value) => sum + value, 0) / args.length,
  СРЗНАЧ: (args) => args.reduce((sum, value) => sum + value, 0) / args.length,
  COUNT: (args) => args.length,
  СЧЁТ: (args) => args.length,
  СЧЕТ: (args) => args.length,
  ABS: ([value]) => Math.abs(value)
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
    // «=SUM(1, 2)» — запятая с пробелом за ней разделяет числа (так пишут в
    // английском Excel), а не десятичная: иначе выходило 1,2 вместо 3.
    if (char === "," && /\s/.test(source[at + 1] ?? "")) {
      tokens.push({ kind: "sep" });
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
        else if (next === "," && /\s/.test(source[at + 1] ?? "")) break;
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
    return { ok: true, value: roundHalfAway(value) };
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
