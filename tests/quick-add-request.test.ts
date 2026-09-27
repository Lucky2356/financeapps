import { describe, expect, it } from "vitest";

import {
  readShortcutLink,
  requestQuickAdd,
  takeQuickAddRequest
} from "@/lib/transactions/quick-add-request";

// Ярлыки на значке Android открывают «Быстрое добавление» сразу нужным.

describe("ярлыки на значке", () => {
  it("разбирает ссылки ярлыков", () => {
    expect(readShortcutLink("financeapps://add?type=EXPENSE")).toEqual({ type: "EXPENSE" });
    expect(readShortcutLink("financeapps://add?type=INCOME")).toEqual({ type: "INCOME" });
    expect(readShortcutLink("financeapps://receipt")).toEqual({
      type: "EXPENSE",
      scanReceipt: true
    });
  });

  it("ссылка связки и чужое — не ярлык", () => {
    expect(readShortcutLink("financeapps://pair?s=x&c=y&k=z")).toBeNull();
    expect(readShortcutLink("financeapps://add?type=DROP")).toBeNull();
    expect(readShortcutLink("https://example.com")).toBeNull();
  });

  it("просьба ждёт, пока кнопка её заберёт, и отдаётся один раз", () => {
    requestQuickAdd({ type: "INCOME" });
    expect(takeQuickAddRequest()).toEqual({ type: "INCOME" });
    expect(takeQuickAddRequest()).toBeNull();
  });
});
