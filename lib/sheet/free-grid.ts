// Свободный лист: ссылки на клетки в формулах.
//
// В бюджетном листе ссылок нет нарочно (см. formula.ts): остаток и итоги он
// считает сам, а его столбцы двигаются и прячутся. Свободный лист — другое:
// это и есть «как в Excel», и без «=A1+B1» и «=СУММ(A1:A10)» он был
// калькулятором в клетках — посчитать итог своего же списка в нём было нельзя.
//
// Ссылка подставляется в формулу числом, и дальше считает тот же evaluate,
// что и везде. Диапазон превращается в список чисел через «;» — его и ждут
// СУММ, МИН, МАКС, СРЗНАЧ, СЧЁТ. Пустая клетка в арифметике — ноль, в
// диапазоне не считается, как в Excel. Текст в арифметике — ошибка, в
// диапазоне пропускается.

import { evaluate } from "@/lib/sheet/formula";

export type FreeShown = { value: number | null; error: boolean; text?: string };

type Position = { r: number; c: number };

/** «A» → 0, «Z» → 25, «AA» → 26. */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** 0 → «A», 25 → «Z», 26 → «AA». */
export function columnName(index: number): string {
  let name = "";
  let rest = index + 1;
  while (rest > 0) {
    const digit = (rest - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    rest = Math.floor((rest - 1) / 26);
  }
  return name;
}

/** Ссылка вида A1, $B$7, AA10 — и диапазон A1:B3. Только латиница, как в Excel. */
const REFERENCE = /(\$?)([A-Za-z]{1,2})(\$?)(\d{1,4})(?::(\$?)([A-Za-z]{1,2})(\$?)(\d{1,4}))?/g;

/** Не часть ли это имени функции или другого слова: «LOG10», «СУММ1». */
function standsAlone(source: string, start: number, end: number): boolean {
  const before = source[start - 1] ?? "";
  const after = source[end] ?? "";
  return !/[A-Za-zА-Яа-яЁё0-9_]/.test(before) && !/[A-Za-zА-Яа-яЁё0-9_(]/.test(after);
}

/** Есть ли в вводе ссылки на клетки — то есть зависит ли он от других. */
export function hasReferences(input: string): boolean {
  if (!input.trim().startsWith("=")) return false;
  for (const match of input.matchAll(REFERENCE)) {
    if (standsAlone(input, match.index, match.index + match[0].length)) return true;
  }
  return false;
}

/** Число — строкой, которую поймёт разбор формулы (минус — в скобках). */
function literal(value: number): string {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(15)));
  const plain = /e/i.test(text) ? value.toFixed(10).replace(/\.?0+$/, "") : text;
  return value < 0 ? `(${plain})` : plain;
}

/** Ввод клетки без ссылок — как и прежде (см. freeValue в sheets.ts). */
export type PlainValue = (input: string) => { value: number | null; error: boolean };

/**
 * Посчитать весь лист. `inputs` — ввод клеток по ключу «r|c». Ответ — что
 * показать в каждой непустой клетке. Цикл (A1 ссылается на B1, B1 — на A1)
 * — ошибка в каждой его клетке, а не зависание.
 */
export function evaluateFreeGrid(
  inputs: ReadonlyMap<string, string>,
  plain: PlainValue
): Map<string, FreeShown> {
  const done = new Map<string, FreeShown>();
  const visiting = new Set<string>();

  function shown(key: string): FreeShown {
    const ready = done.get(key);
    if (ready) return ready;
    const input = inputs.get(key) ?? "";
    if (!hasReferences(input)) {
      const result = plain(input);
      done.set(key, result);
      return result;
    }
    if (visiting.has(key)) return { value: null, error: true, text: "cycle" };
    visiting.add(key);
    const result = withReferences(input);
    visiting.delete(key);
    done.set(key, result);
    return result;
  }

  function withReferences(input: string): FreeShown {
    let broken = false;
    const source = input.replace(REFERENCE, (whole, ...parts) => {
      const offset = parts[8] as number;
      if (!standsAlone(input, offset, offset + whole.length)) return whole;
      const from = { c: columnIndex(parts[1] as string), r: Number(parts[3]) - 1 };
      if (parts[5] === undefined) {
        const cell = shown(`${from.r}|${from.c}`);
        if (cell.error) broken = true;
        // Пустая клетка — ноль; текст в арифметике — ошибка, как #ЗНАЧ! в Excel.
        if (cell.value === null && (inputs.get(`${from.r}|${from.c}`) ?? "").trim()) broken = true;
        return literal(cell.value ?? 0);
      }
      const to = { c: columnIndex(parts[5] as string), r: Number(parts[7]) - 1 };
      const numbers: string[] = [];
      for (let r = Math.min(from.r, to.r); r <= Math.max(from.r, to.r); r += 1) {
        for (let c = Math.min(from.c, to.c); c <= Math.max(from.c, to.c); c += 1) {
          const cell = shown(`${r}|${c}`);
          if (cell.error) broken = true;
          if (cell.value !== null) numbers.push(literal(cell.value));
        }
      }
      return numbers.join(";");
    });
    if (broken) return { value: null, error: true };
    const result = evaluate(source);
    if (!result) return { value: null, error: false };
    return result.ok ? { value: result.value, error: false } : { value: null, error: true };
  }

  for (const key of inputs.keys()) shown(key);
  return done;
}

/**
 * Сдвинуть ссылки в формуле, когда строку или столбец вставили или убрали —
 * как это делает Excel. Ссылка на убранную строку становится «#ССЫЛКА!»:
 * молча показывать на соседнюю было бы хуже ошибки.
 */
export function shiftReferences(
  input: string,
  axis: "r" | "c",
  index: number,
  delta: 1 | -1
): string {
  if (!hasReferences(input)) return input;
  const move = (position: Position): Position | null => {
    const at = position[axis];
    if (delta === -1 && at === index) return null;
    if (at >= index) return { ...position, [axis]: at + delta };
    return position;
  };
  const write = (dollarC: string, position: Position, dollarR: string) =>
    `${dollarC}${columnName(position.c)}${dollarR}${position.r + 1}`;
  return input.replace(REFERENCE, (whole, ...parts) => {
    const offset = parts[8] as number;
    if (!standsAlone(input, offset, offset + whole.length)) return whole;
    const rawFrom = { c: columnIndex(parts[1] as string), r: Number(parts[3]) - 1 };
    if (parts[5] === undefined) {
      const moved = move(rawFrom);
      return moved ? write(parts[0] as string, moved, parts[2] as string) : "#ССЫЛКА!";
    }
    // Диапазон сжимается, а не ломается, когда убрали строку внутри него или
    // на его краю, — как в Excel. Ломается, только если от него не осталось
    // ничего.
    const rawTo = { c: columnIndex(parts[5] as string), r: Number(parts[7]) - 1 };
    const low = Math.min(rawFrom[axis], rawTo[axis]);
    const high = Math.max(rawFrom[axis], rawTo[axis]);
    let begin = low;
    let end = high;
    if (delta === 1) {
      if (low >= index) begin += 1;
      if (high >= index) end += 1;
    } else {
      if (low > index) begin -= 1;
      if (high >= index) end -= 1;
      if (begin > end) return "#ССЫЛКА!";
    }
    const first = { ...rawFrom, [axis]: begin };
    const last = { ...rawTo, [axis]: end };
    return `${write(parts[0] as string, first, parts[2] as string)}:${write(
      parts[4] as string,
      last,
      parts[6] as string
    )}`;
  });
}
