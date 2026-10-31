import { afterEach, describe, expect, it, vi } from "vitest";

import { importCsvRows } from "@/lib/api/local/ledger";
import { createInitialState } from "@/lib/api/local/state";
import * as categorySuggest from "@/lib/category-suggest";
import type { SuggestHistoryItem } from "@/lib/category-suggest";
import { translate } from "@/lib/i18n/catalog";
import { IndexedDbStorageAdapter } from "@/lib/storage/IndexedDbStorageAdapter";
import { HttpSyncTransport } from "@/lib/sync/HttpSyncTransport";
import { shellFetch } from "@/lib/sync/shell-fetch";
import { normalizeForMatch } from "@/lib/text/normalize";
import type { TransactionRow } from "@/types/finance";

// Ошибки платформы, найденные разбором 2.8.1: медленный импорт выписки,
// переподключение потока событий без паузы, обновление без отчёта об ошибке,
// заблокированное хранилище браузера, вечное ожидание базы. Каждая проверка
// падала до исправления.

vi.mock("@/lib/sync/shell-fetch", () => ({ shellFetch: vi.fn() }));

const toastMock = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-id"),
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  message: vi.fn(),
  dismiss: vi.fn()
}));
vi.mock("sonner", () => ({ toast: toastMock }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Прежний подбор категории — дословно, как он был до разбора: эталон ответа. */
function referenceSuggest(
  description: string,
  history: SuggestHistoryItem[],
  type?: "INCOME" | "EXPENSE"
): string | null {
  const tokenize = (text: string) =>
    normalizeForMatch(text)
      .split(/\s+/)
      .filter((word) => word.length >= 3);
  const tokens = new Set(tokenize(description));
  if (tokens.size === 0) return null;
  const scores = new Map<string, number>();
  for (const item of history) {
    if (type && item.type && item.type !== type) continue;
    let overlap = 0;
    for (const token of tokenize(item.description ?? "")) if (tokens.has(token)) overlap += 1;
    if (overlap === 0) continue;
    scores.set(item.category.id, (scores.get(item.category.id) ?? 0) + overlap);
  }
  let best: string | null = null;
  let bestScore = 0;
  for (const [categoryId, score] of scores) {
    if (score > bestScore) {
      best = categoryId;
      bestScore = score;
    }
  }
  return best;
}

const WORDS = ["пятёрочка", "магнит", "такси", "метро", "кафе", "аптека", "зарплата", "кофе"];

/** Детерминированная история: мало слов — много ничьих, на них и проверка. */
function sampleHistory(size: number): SuggestHistoryItem[] {
  return Array.from({ length: size }, (_, i) => ({
    description:
      i % 17 === 0 ? null : `${WORDS[i % WORDS.length]} ${WORDS[(i * 3) % WORDS.length]} ${i}`,
    type: i % 11 === 0 ? undefined : i % 3 === 0 ? ("INCOME" as const) : ("EXPENSE" as const),
    category: { id: `cat-${i % 5}` }
  }));
}

describe("импорт выписки не тормозит на большой истории", () => {
  it("подборщик по указателю отвечает так же, как прежний перебор, и после prepend", () => {
    // Ответы — те же, вплоть до ничьих; добавленная в начало строка учитывается.
    const history = sampleHistory(400);
    const suggester = categorySuggest.createCategorySuggester(history);
    const queries = [
      "пятёрочка",
      "метро такси",
      "кофе кафе аптека",
      "зарплата",
      "магнит кофе",
      "ничего",
      ""
    ];
    for (const query of queries) {
      for (const type of [undefined, "INCOME", "EXPENSE"] as const) {
        expect(suggester.suggest(query, { type })).toBe(referenceSuggest(query, history, type));
        expect(categorySuggest.suggestCategoryId(query, history, { type })).toBe(
          referenceSuggest(query, history, type)
        );
      }
    }
    const fresh: SuggestHistoryItem = {
      description: "аптека аптека кофе",
      type: "EXPENSE",
      category: { id: "cat-new" }
    };
    suggester.prepend(fresh);
    for (const query of queries) {
      for (const type of [undefined, "INCOME", "EXPENSE"] as const) {
        expect(suggester.suggest(query, { type })).toBe(
          referenceSuggest(query, [fresh, ...history], type)
        );
      }
    }
  });

  it("1000 строк в учёт из 5000 операций — за секунды, порядок и остаток прежние", () => {
    // Раньше каждая строка разбирала всю историю заново: десятки мс на строку.
    const state = createInitialState();
    state.accounts = [
      { id: "acc-card", name: "Карта", type: "DEBIT_CARD", balance: 0, currency: "RUB" }
    ];
    const expense = state.categories.filter((item) => item.kind === "EXPENSE").slice(0, 5);
    state.transactions = Array.from(
      { length: 5000 },
      (_, i): TransactionRow => ({
        id: `tx-${i}`,
        amount: 100 + i,
        type: "EXPENSE",
        date: "2026-01-15T00:00:00.000Z",
        description: `${WORDS[i % WORDS.length]} покупка номер ${i} ${WORDS[(i * 5) % WORDS.length]}`,
        account: { id: "acc-card", label: "Карта" },
        category: { ...expense[i % expense.length], id: expense[i % expense.length].id }
      })
    );
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      date: `${String((i % 28) + 1).padStart(2, "0")}.03.2026`,
      amount: `-${i + 1}`,
      description: `${WORDS[(i * 7) % WORDS.length]} чек ${i}`
    }));

    const started = performance.now();
    const result = importCsvRows(state, {
      amountColumn: "amount",
      dateColumn: "date",
      descriptionColumn: "description",
      rows: JSON.stringify(rows)
    });
    const elapsed = performance.now() - started;

    expect(result).toEqual({ imported: 1000, skipped: 0, linkedTransfers: 0 });
    expect(elapsed).toBeLessThan(3000);
    // Новые строки — сверху, последняя строка файла первой, история под ними.
    expect(state.transactions).toHaveLength(6000);
    expect(state.transactions[0].description).toBe(rows[999].description);
    expect(state.transactions[999].description).toBe(rows[0].description);
    expect(state.transactions[1000].id).toBe("tx-0");
    // Остаток уменьшился ровно на сумму файла: 1 + 2 + … + 1000.
    expect(state.accounts[0].balance).toBeCloseTo(-500500, 2);
    expect(state.importBatches?.[0].transactionIds).toHaveLength(1000);
  }, 120_000);
});

describe("поток событий не долбит службу", () => {
  it("поток, закрывающийся сразу после 200, переподключается всё реже", async () => {
    // Пауза сбрасывалась на каждом открытии: раз в секунду навсегда, и каждое
    // открытие тянуло сверку списка. Сбрасывается только у пожившего потока.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi.mocked(shellFetch);
    fetchMock.mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            }
          }),
          { status: 200 }
        )
    );
    const onOpen = vi.fn();
    const stop = new HttpSyncTransport({
      base: "https://sync.example.org",
      token: "token-abc"
    }).watch(() => {}, onOpen);

    await vi.advanceTimersByTimeAsync(60_000);
    const quick = fetchMock.mock.calls.length;
    expect(quick).toBeLessThan(15);
    expect(onOpen).toHaveBeenCalledTimes(quick);

    // Настоящий разрыв после долгой жизни — переподключение и сверка сразу.
    fetchMock.mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              setTimeout(() => controller.close(), 30_000);
            }
          }),
          { status: 200 }
        )
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.length - quick).toBe(2);
    expect(onOpen).toHaveBeenCalledTimes(quick + 2);
    stop();
  });
});

describe("обновление на компьютере сообщает об ошибке", () => {
  it("неудачная установка — тост ошибки вместо вечного «скачивается»", async () => {
    // Раньше отказ install() уходил в необработанное исключение.
    const { installDesktopUpdate } = await import("@/components/automation-runner");
    const install = vi.fn().mockRejectedValue(new Error("подпись не сошлась"));
    await installDesktopUpdate({ install }, "ru");
    expect(install).toHaveBeenCalledTimes(1);
    expect(toastMock.loading).toHaveBeenCalledWith(translate("ru", "set.update.downloading"));
    expect(toastMock.error).toHaveBeenCalledWith(
      translate("ru", "set.update.failed"),
      expect.objectContaining({ id: "toast-id", description: "подпись не сошлась" })
    );
  });
});

describe("заблокированное хранилище браузера", () => {
  it("язык при запуске берётся с устройства, если localStorage бросает", async () => {
    // В строгом режиме приватности чтение localStorage бросает SecurityError.
    const { resolveInitialLocale } = await import("@/lib/i18n/context");
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        }
      },
      navigator: { language: "en-US" }
    });
    expect(resolveInitialLocale()).toBe("en");
  });

  it("открытие базы, заблокированное другой вкладкой, не висит вечно", async () => {
    // Без onblocked обещание не исполнялось никогда, а с ним — и всё приложение.
    const request: Record<string, unknown> = {};
    vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });
    const adapter = new IndexedDbStorageAdapter("audit-281");
    const pending = adapter.getItem("ключ");
    await Promise.resolve();
    (request.onblocked as (() => void) | undefined)?.();
    const outcome = await Promise.race([
      pending.then(
        () => "открылась",
        (error: Error) => `отказ: ${error.message}`
      ),
      new Promise((resolve) => setTimeout(() => resolve("висит"), 50))
    ]);
    expect(outcome).toMatch(/^отказ: /);
    // Если другая вкладка всё же отпустила базу — лишнее соединение закрывается.
    const db = { close: vi.fn() };
    request.result = db;
    (request.onsuccess as (() => void) | undefined)?.();
    expect(db.close).toHaveBeenCalled();
  });
});
