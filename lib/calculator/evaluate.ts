// Arithmetic for the amount fields: "три раза по 1200", "5400 минус 15%".
//
// Deliberately NOT `eval`/`new Function`. The expression comes from a text
// field, and the desktop shell runs the app with a strict CSP for exactly this
// reason — a tokenizer plus shunting-yard is a dozen lines more and cannot
// execute anything.
//
// Everything that is not a valid expression comes back as an `error`, never as
// a thrown exception: the calculator sits inside a form, and a stray keystroke
// must not take the form down with it.

import { roundMoney } from "@/lib/utils";

export type CalcError = "empty" | "syntax" | "divide-by-zero";
export type CalcResult = { value: number } | { error: CalcError };

type Operator = "+" | "-" | "*" | "/";
type Token =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: Operator }
  | { kind: "percent" }
  | { kind: "paren"; value: "(" | ")" };

const PRECEDENCE: Record<Operator, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

// `×` and `÷` come from the on-screen keypad, `*` and `/` from a keyboard;
// a comma is how a Russian layout types a decimal point. Whitespace is NOT
// stripped here — the tokenizer needs it to tell "1 234" (a pasted amount) from
// "100 2" (two numbers with no operator, which is a mistake).
function normalize(input: string): string {
  return input
    .replace(/[×хx]/gi, "*")
    .replace(/[÷:]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/[   ]/g, " ")
    .trim();
}

// A space continues a number only when it separates thousands — exactly three
// digits follow and no more. That is how the app itself renders money
// (formatCurrency uses a non-breaking space), so a pasted "1 234,56" parses,
// while "100 2" stays the error it is.
const THOUSANDS_GROUP = /^ (\d{3})(?!\d)/;

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === " ") {
      index += 1;
      continue;
    }

    if (char >= "0" && char <= "9") {
      let digits = "";
      let dots = 0;
      while (index < source.length) {
        const next = source[index];
        if (next === ".") {
          dots += 1;
          if (dots > 1) return null;
        } else if (next < "0" || next > "9") {
          const group = THOUSANDS_GROUP.exec(source.slice(index));
          if (group && dots === 0) {
            digits += group[1];
            index += group[0].length;
            continue;
          }
          break;
        }
        digits += next;
        index += 1;
      }
      const value = Number(digits);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "number", value });
      continue;
    }

    // A leading ".5" is a number too, but a lone "." is not.
    if (char === ".") {
      const match = /^\.\d+/.exec(source.slice(index));
      if (!match) return null;
      tokens.push({ kind: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "%") {
      tokens.push({ kind: "percent" });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }

    return null; // anything else is not arithmetic
  }

  return tokens;
}

// A minus is unary when nothing that could be a left operand precedes it, e.g.
// at the very start or right after "(" or another operator. Rewritten as
// "0 - x" so the rest of the pipeline only ever sees binary operators.
function insertUnaryZeros(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const previous = tokens[i - 1];
    const startsOperand =
      !previous ||
      (previous.kind === "paren" && previous.value === "(") ||
      previous.kind === "operator";

    if (
      token.kind === "operator" &&
      (token.value === "-" || token.value === "+") &&
      startsOperand
    ) {
      if (token.value === "-") {
        out.push({ kind: "number", value: 0 }, { kind: "operator", value: "-" });
      }
      // A unary plus is a no-op — drop it.
      continue;
    }
    out.push(token);
  }
  return out;
}

function applyOperator(operator: Operator, left: number, right: number): number | CalcError {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? "divide-by-zero" : left / right;
  }
}

/**
 * Percent behaves the way it does on a phone calculator, because that is what
 * anyone reaching for it while entering money expects:
 *
 *   1000 + 10%  → 1100   (10% OF the left operand, added)
 *   1000 - 10%  → 900
 *   1000 * 10%  → 100    (a plain hundredth)
 *   1000 / 10%  → 10000
 *
 * A percent with no operator in front of it (`50%`) is just 0.5.
 */
function resolvePercent(operator: Operator | null, left: number, percentOf: number): number {
  if (operator === "+" || operator === "-") return (left * percentOf) / 100;
  return percentOf / 100;
}

export function evaluateExpression(input: string): CalcResult {
  const source = normalize(input ?? "");
  if (source === "") return { error: "empty" };

  const raw = tokenize(source);
  if (!raw) return { error: "syntax" };
  const tokens = insertUnaryZeros(raw);
  if (tokens.length === 0) return { error: "syntax" };

  // Shunting-yard straight into evaluation: one stack of numbers, one of
  // operators. `%` is resolved as soon as it is read, because its meaning
  // depends on the operator immediately to its left.
  const values: number[] = [];
  const operators: Array<Operator | "("> = [];

  function reduceTop(): CalcError | null {
    const operator = operators.pop();
    if (!operator || operator === "(") return "syntax";
    const right = values.pop();
    const left = values.pop();
    if (right === undefined || left === undefined) return "syntax";
    const result = applyOperator(operator, left, right);
    if (typeof result === "string") return result;
    values.push(result);
    return null;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.kind === "number") {
      // Look ahead for "%" so the pending operator can decide what it means.
      const next = tokens[i + 1];
      if (next?.kind === "percent") {
        const pending = operators[operators.length - 1];
        const operator = pending && pending !== "(" ? pending : null;
        const left = values[values.length - 1] ?? 0;
        values.push(resolvePercent(operator, left, token.value));
        i += 1;
        continue;
      }
      values.push(token.value);
      continue;
    }

    if (token.kind === "percent") return { error: "syntax" }; // "%" with no number

    if (token.kind === "paren") {
      if (token.value === "(") {
        operators.push("(");
        continue;
      }
      while (operators.length > 0 && operators[operators.length - 1] !== "(") {
        const failure = reduceTop();
        if (failure) return { error: failure };
      }
      if (operators.pop() !== "(") return { error: "syntax" }; // unbalanced
      continue;
    }

    while (operators.length > 0) {
      const top = operators[operators.length - 1];
      if (top === "(" || PRECEDENCE[top] < PRECEDENCE[token.value]) break;
      const failure = reduceTop();
      if (failure) return { error: failure };
    }
    operators.push(token.value);
  }

  while (operators.length > 0) {
    if (operators[operators.length - 1] === "(") return { error: "syntax" };
    const failure = reduceTop();
    if (failure) return { error: failure };
  }

  if (values.length !== 1) return { error: "syntax" };
  const value = values[0];
  if (!Number.isFinite(value)) return { error: "syntax" };

  return { value: roundMoney(value) };
}

/** Convenience for the UI: the number, or null when the expression is not one. */
export function calculatedValue(input: string): number | null {
  const result = evaluateExpression(input);
  return "value" in result ? result.value : null;
}
