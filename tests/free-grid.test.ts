import { describe, expect, it } from "vitest";

import { freeValue } from "@/lib/api/local/sheets";
import { evaluateFreeGrid, hasReferences, shiftReferences } from "@/lib/sheet/free-grid";

// Свободный лист со ссылками на клетки: «=A1+B1», «=СУММ(A1:A10)».

function grid(cells: Record<string, string>) {
  // «A1» → «0|0», чтобы проверки читались как в Excel.
  const inputs = new Map<string, string>();
  for (const [address, input] of Object.entries(cells)) {
    const match = /^([A-Z]+)(\d+)$/.exec(address)!;
    const c = match[1].charCodeAt(0) - 65;
    inputs.set(`${Number(match[2]) - 1}|${c}`, input);
  }
  const shown = evaluateFreeGrid(inputs, freeValue);
  return (address: string) => {
    const match = /^([A-Z]+)(\d+)$/.exec(address)!;
    return shown.get(`${Number(match[2]) - 1}|${match[1].charCodeAt(0) - 65}`);
  };
}

describe("ссылки в формулах свободного листа", () => {
  it("складывает клетки и диапазоны", () => {
    const at = grid({
      A1: "Хлеб",
      B1: "120",
      A2: "Молоко",
      B2: "95,50",
      A3: "Итого",
      B3: "=СУММ(B1:B2)",
      C3: "=B3*2",
      D3: "=СРЗНАЧ(B1:B2)",
      E3: "=СЧЁТ(A1:B2)"
    });
    expect(at("B3")?.value).toBe(215.5);
    expect(at("C3")?.value).toBe(431);
    expect(at("D3")?.value).toBe(107.75);
    // Текст в диапазоне не считается — только числа.
    expect(at("E3")?.value).toBe(2);
  });

  it("пустая клетка — ноль, текст в арифметике — ошибка", () => {
    const at = grid({ A1: "=B1+5", A2: "Хлеб", A3: "=A2+1" });
    expect(at("A1")?.value).toBe(5);
    expect(at("A3")?.error).toBe(true);
  });

  it("минус и дроби подставляются верно", () => {
    const at = grid({ A1: "-1500", A2: "0,5", A3: "=A1*A2", A4: "=A1-A1" });
    expect(at("A3")?.value).toBe(-750);
    expect(at("A4")?.value).toBe(0);
  });

  it("цикл — ошибка, а не зависание", () => {
    const at = grid({ A1: "=B1+1", B1: "=A1+1", C1: "=A1" });
    expect(at("A1")?.error).toBe(true);
    expect(at("B1")?.error).toBe(true);
    expect(at("C1")?.error).toBe(true);
  });

  it("без «=» это не формула: «A1» — просто текст", () => {
    expect(hasReferences("A1")).toBe(false);
    expect(hasReferences("=A1")).toBe(true);
    // Имя функции с цифрой — не ссылка.
    expect(hasReferences("=СУММ(1;2)")).toBe(false);
  });

  it("$ в ссылке понимается", () => {
    const at = grid({ A1: "10", B1: "=$A$1*3" });
    expect(at("B1")?.value).toBe(30);
  });
});

describe("сдвиг ссылок при вставке и удалении строк", () => {
  it("вставка строки выше сдвигает ссылку вниз", () => {
    expect(shiftReferences("=A3+B1", "r", 1, 1)).toBe("=A4+B1");
    expect(shiftReferences("=СУММ(A1:A5)", "r", 2, 1)).toBe("=СУММ(A1:A6)");
  });

  it("удаление строки: ссылка на неё — #ССЫЛКА!, диапазон сжимается", () => {
    expect(shiftReferences("=A3", "r", 2, -1)).toBe("=#ССЫЛКА!");
    expect(shiftReferences("=A5", "r", 2, -1)).toBe("=A4");
    expect(shiftReferences("=СУММ(A1:A5)", "r", 2, -1)).toBe("=СУММ(A1:A4)");
    expect(shiftReferences("=СУММ(A3:A3)", "r", 2, -1)).toBe("=СУММ(#ССЫЛКА!)");
  });

  it("столбцы — так же", () => {
    expect(shiftReferences("=C1+A1", "c", 1, -1)).toBe("=B1+A1");
    expect(shiftReferences("=B1", "c", 0, 1)).toBe("=C1");
  });
});

describe("выделение", () => {
  it("сумма, среднее и число чисел — без текста и пустых", async () => {
    const { boxOf, selectionStats, selectionAsText } = await import("@/lib/sheet/free-selection");
    const inputs = new Map([
      ["0|0", "Хлеб"],
      ["0|1", "120"],
      ["1|0", "Молоко"],
      ["1|1", "=B1-20"]
    ]);
    const shown = evaluateFreeGrid(inputs, freeValue);
    const box = boxOf({ anchor: { r: 1, c: 1 }, focus: { r: 0, c: 0 } });
    expect(selectionStats(box, shown)).toEqual({ sum: 220, average: 110, count: 2 });
    // В буфер — как в Excel: табуляция и перевод строки, формула — формулой.
    expect(selectionAsText(box, inputs)).toBe("Хлеб\t120\nМолоко\t=B1-20");
  });
});

describe("лист целиком: ссылки идут за клетками", () => {
  it("вставка и удаление строки сдвигают формулы, итог остаётся верным", async () => {
    const { LocalApiClient } = await import("@/lib/api/LocalApiClient");
    const { MemoryStorageAdapter } = await import("@/lib/storage/MemoryStorageAdapter");
    const api = new LocalApiClient(new MemoryStorageAdapter());
    const tab = await api.post("/sheets", { action: "create", name: "Расчёты", kind: "free" });
    await api.post("/sheet", {
      sheetId: tab.id,
      action: "setFree",
      cells: [
        { r: 0, c: 0, input: "100" },
        { r: 1, c: 0, input: "200" },
        { r: 2, c: 0, input: "300" },
        { r: 3, c: 0, input: "=СУММ(A1:A3)" }
      ]
    });
    const total = async () => {
      const page = await api.get(`/workbook?sheet=${tab.id}`);
      return page.free!.cells.find((cell) => cell.input.startsWith("="));
    };
    expect((await total())?.value).toBe(600);

    await api.post("/sheet", { sheetId: tab.id, action: "insertFreeRow", index: 1 });
    expect((await total())?.input).toBe("=СУММ(A1:A4)");
    expect((await total())?.value).toBe(600);

    await api.post("/sheet", { sheetId: tab.id, action: "removeFreeRow", index: 2 });
    expect((await total())?.input).toBe("=СУММ(A1:A3)");
    expect((await total())?.value).toBe(400);
  });
});
