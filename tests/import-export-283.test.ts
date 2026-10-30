import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState, type LocalState } from "@/lib/api/local/state";
import {
  importCsvRows,
  linkTransfer,
  undoLastImport,
  upsertAccount,
  upsertTransaction
} from "@/lib/api/local/ledger";
import { importWorkbook } from "@/lib/api/local/sheets";
import { gridFromClipboard, guessRole, parseAmount, planImport } from "@/lib/sheet/import";
import { ExportService } from "@/services/export/ExportService";
import { CsvImportMapper } from "@/services/import/CsvImportMapper";
import { parseImportedAmount, parseImportedDate } from "@/services/import/CsvParsing";
import type { TransactionRow } from "@/types/finance";

// Импорт и выгрузка после разбора 283. Каждая проверка падала до исправления.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

const mapper = new CsvImportMapper();

function day(value: unknown) {
  const date = parseImportedDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function account(state: LocalState, name: string, currency = "RUB") {
  return upsertAccount(state, { name, type: "DEBIT_CARD", balance: "0", currency }, "POST") as {
    id: string;
  };
}

function expenseCategory(state: LocalState) {
  return state.categories.find((item) => item.kind === "EXPENSE")!;
}

function txRow(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: "t1",
    amount: 5000,
    type: "EXPENSE",
    date: "2026-10-05",
    description: "Перевод между счетами",
    account: { id: "a", label: "Карта A" },
    category: { id: "c", label: "Прочее", color: "#000" },
    ...partial
  };
}

const importMapping = {
  dateColumn: "date",
  amountColumn: "amount",
  descriptionColumn: "description",
  categoryColumn: "",
  accountColumn: "account"
};

describe("1. фильтр повторов различает знак и счёт", () => {
  it("поступление +5000 на карту B не повтор траты 5000 с карты A", () => {
    const existing = [txRow({})];
    const rows = [
      {
        date: "05.10.2026",
        amount: "5000",
        description: "Перевод между счетами",
        account: "Карта B"
      }
    ];
    expect(mapper.findDuplicateRows(rows, importMapping, existing).size).toBe(0);
    // Без столбца счёта решает знак: +5000 — не трата 5000.
    const noAccount = { ...importMapping, accountColumn: "" };
    expect(mapper.findDuplicateRows(rows, noAccount, existing).size).toBe(0);
    // А настоящий повтор (та же трата, тот же счёт) по-прежнему узнаётся.
    const same = [{ ...rows[0], amount: "-5000", account: "Карта A" }];
    expect([...mapper.findDuplicateRows(same, importMapping, existing)]).toEqual([0]);
  });
});

describe("2. выгрузка → загрузка не меняет описания и не задваивает", () => {
  it("снимает защитный апостроф перед = + - @", () => {
    const tx = txRow({
      description: "-5% скидка",
      category: { id: "c", label: "=Еда", color: "#000" }
    });
    const csv = new ExportService().transactionsToCsv(
      [tx],
      [{ id: "a", currency: "RUB" } as never],
      "ru"
    );
    expect(csv).toContain("'-5% скидка");
    const parsed = mapper.parse(csv);
    expect(parsed.rows[0].description).toBe("-5% скидка");
    expect(parsed.rows[0].category).toBe("=Еда");
    const mapping = mapper.suggestColumns(parsed.fields);
    expect([...mapper.findDuplicateRows(parsed.rows, mapping, [tx])]).toEqual([0]);
  });
});

describe("3. отмена импорта не рвёт перевод пополам", () => {
  it("отказывает, если импортированная строка связана в перевод с ручной", () => {
    const state = createInitialState();
    const cardA = account(state, "Карта A");
    const manual = upsertTransaction(
      state,
      {
        amount: "5000",
        type: "EXPENSE",
        accountId: cardA.id,
        categoryId: expenseCategory(state).id,
        date: new Date(2026, 9, 5).toISOString(),
        description: "Перевод между счетами"
      },
      "POST"
    );
    importCsvRows(state, {
      ...importMapping,
      rows: JSON.stringify([
        { date: "05.10.2026", amount: "5000", description: "Перевод", account: "Карта B" }
      ])
    });
    const imported = state.transactions.find((item) => item.account.label === "Карта B")!;
    linkTransfer(state, { expenseId: manual.id, incomeId: imported.id });

    expect(() => undoLastImport(state)).toThrow(/перевод/i);
    // Ничего не тронуто: обе половины на месте, импорт можно отменить позже.
    expect(state.transactions.find((item) => item.id === manual.id)?.transferId).toBeTruthy();
    expect(state.transactions.some((item) => item.id === imported.id)).toBe(true);
    expect(state.importBatches).toHaveLength(1);
  });
});

describe("4. одна сумма вне предела не валит весь импорт", () => {
  it("пропускает строку и считает её среди пропущенных", () => {
    const state = createInitialState();
    const rows = [
      { date: "05.10.2026", amount: "-100", description: "Кофе", account: "Карта" },
      { date: "05.10.2026", amount: "-5000000000000", description: "Опечатка", account: "Карта" }
    ];
    const result = importCsvRows(state, { ...importMapping, rows: JSON.stringify(rows) });
    expect(result).toEqual(expect.objectContaining({ imported: 1, skipped: 1 }));
    const check = mapper.validateRows(rows, importMapping, "ru");
    expect(check.validRows).toBe(1);
    expect(check.warnings).toHaveLength(1);
  });
});

describe("5. даты", () => {
  it("читает дефисы и год впереди с любым разделителем", () => {
    expect(day("05-10-2026")).toBe("2026-10-05");
    expect(day("25-10-2026")).toBe("2026-10-25");
    expect(day("2026/10/05")).toBe("2026-10-05");
    expect(day("2026.10.05")).toBe("2026-10-05");
  });

  it("число из пяти цифр — дата Excel, прочие голые числа — не дата", () => {
    expect(day("46300")).toBe("2026-10-05");
    expect(parseImportedDate("12")).toBeNull();
    expect(parseImportedDate("2026")).toBeNull();
    expect(parseImportedDate("01.01.2150")).toBeNull();
  });
});

describe("6. суммы с тремя и больше знаками после разделителя", () => {
  it("не превращает дробь в целое", () => {
    expect(parseImportedAmount("1234.5678")).toBeCloseTo(1234.5678, 6);
    expect(parseImportedAmount("1,234.567")).toBeCloseTo(1234.567, 6);
    expect(parseImportedAmount("1.2E+3")).toBe(1200);
    expect(parseImportedAmount("0,500")).toBe(0.5);
    // Прежние записи читаются как раньше.
    expect(parseImportedAmount("1,234")).toBe(1234);
    expect(parseImportedAmount("1.234.567")).toBe(1234567);
    expect(parseImportedAmount("1 234,56")).toBe(1234.56);
    expect(parseImportedAmount("1.234,56")).toBe(1234.56);
    expect(parseImportedAmount("-500 руб.")).toBe(-500);
  });
});

describe("7. валюта из своей же выгрузки", () => {
  it("новый счёт заводится в валюте из столбца currency", () => {
    const state = createInitialState();
    const fields = ["date", "amount", "currency", "type", "category", "account", "description"];
    expect(mapper.suggestColumns(fields).currencyColumn).toBe("currency");
    importCsvRows(state, {
      ...importMapping,
      rows: JSON.stringify([
        { date: "2026-10-05", amount: "-10", currency: "USD", account: "Wallet", description: "x" }
      ])
    });
    expect(state.accounts.find((item) => item.name === "Wallet")?.currency).toBe("USD");
  });
});

describe("8. строки счёта в архиве не задваиваются", () => {
  it("повтор узнаётся по архивному счёту с тем же именем", () => {
    const state = createInitialState();
    const card = account(state, "Карта");
    importCsvRows(state, {
      ...importMapping,
      rows: JSON.stringify([
        { date: "05.10.2026", amount: "-100", description: "Кофе", account: "Карта" }
      ])
    });
    state.accounts = state.accounts.map((item) =>
      item.id === card.id ? { ...item, isArchived: true } : item
    );
    const accountsBefore = state.accounts.length;
    const again = importCsvRows(state, {
      ...importMapping,
      rows: JSON.stringify([
        { date: "05.10.2026", amount: "-100", description: "Кофе", account: "Карта" }
      ])
    });
    expect(again).toEqual(expect.objectContaining({ imported: 0, skipped: 1 }));
    expect(state.accounts).toHaveLength(accountsBefore);
  });
});

describe("9. CSV таблицы в cp1251", () => {
  it("диалог переноса читает файл через decodeTextBytes, а не file.text()", () => {
    const source = readFileSync(
      join(__dirname, "..", "components", "sheet", "sheet-import-dialog.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/file\.text\(\)/);
    expect(source).toMatch(/decodeTextBytes\(await file\.arrayBuffer\(\)\)/);
  });
});

describe("10. названия столбцов самого приложения", () => {
  it("узнаёт шаблонные и английские имена", () => {
    expect(guessRole("Подушка на начало")).toBe("savingsOpening");
    expect(guessRole("Balance")).toBe("opening");
    expect(guessRole("Cushion at start")).toBe("savingsOpening");
    expect(guessRole("To savings")).toBe("toSavings");
    expect(guessRole("Deposit interest")).toBe("savingsIncome");
    expect(guessRole("Savings total")).toBe("toSavings");
    expect(guessRole("Saved for renovation")).toBe("opening");
    expect(guessRole("Saving per month")).toBe("income");
    // Прежнее не сломано.
    expect(guessRole("Остаток")).toBe("opening");
    expect(guessRole("Продукты")).toBe("expense");
  });
});

describe("11. числа в клетках таблицы", () => {
  it("скобки, разделители разрядов и экспонента", () => {
    expect(parseAmount("(500)")).toBe(-500);
    expect(parseAmount("12,345.67")).toBe(12345.67);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("4.440892098500626e-16")).toBeCloseTo(0, 10);
    expect(parseAmount("много")).toBeNull();
    // Дата в клетке заметки — не число.
    expect(parseAmount("01.08.2026")).toBeNull();
  });
});

describe("12. большие таблицы", () => {
  it("planImport, вставка и перенос книги не падают на 200 000 строк", () => {
    const grid: string[][] = [
      ["Месяц", "Продукты"],
      ["01.2026", "5"]
    ];
    for (let index = 0; index < 200_000; index += 1) grid.push(["", "x"]);
    expect(() => planImport(grid, [])).not.toThrow();
    const pasted = ["Месяц\tПродукты", ...Array.from({ length: 200_000 }, () => "a\tb")].join("\n");
    expect(() => gridFromClipboard(pasted)).not.toThrow();
    const state = createInitialState();
    const wide = Array.from({ length: 200_000 }, () => [""]);
    let counter = 0;
    expect(() =>
      importWorkbook(
        state,
        [{ name: "Лист", kind: "free", grid: wide }],
        () => `id${(counter += 1)}`,
        "2026-10-30T00:00:00.000Z"
      )
    ).not.toThrow();
  });
});
