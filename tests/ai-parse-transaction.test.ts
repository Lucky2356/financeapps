import { describe, expect, it } from "vitest";

import {
  buildParsePrompt,
  parseTransactionDraft,
  type AiParseContext
} from "@/lib/ai/parse-transaction";

const context: AiParseContext = {
  today: "2026-06-21",
  currency: "RUB",
  categories: [
    { id: "cat-food", label: "Еда", kind: "EXPENSE" },
    { id: "cat-salary", label: "Зарплата", kind: "INCOME" }
  ],
  accounts: [
    { id: "acc-card", name: "Карта" },
    { id: "acc-cash", name: "Наличные" }
  ]
};

describe("buildParsePrompt", () => {
  it("includes category and account ids and the current date", () => {
    const { system, user } = buildParsePrompt("  потратил 1200 на кофе  ", context);
    expect(system).toContain("cat-food");
    expect(system).toContain("acc-card");
    expect(system).toContain("2026-06-21");
    expect(user).toBe("потратил 1200 на кофе");
  });
});

describe("parseTransactionDraft", () => {
  it("parses a clean JSON object", () => {
    const draft = parseTransactionDraft(
      '{"amount": 1200, "type": "EXPENSE", "date": "2026-06-20", "description": "Кофе", "categoryId": "cat-food", "accountId": "acc-card"}',
      context
    );
    expect(draft).toEqual({
      amount: 1200,
      type: "EXPENSE",
      date: "2026-06-20",
      description: "Кофе",
      categoryId: "cat-food",
      accountId: "acc-card"
    });
  });

  it("tolerates code fences and surrounding prose", () => {
    const draft = parseTransactionDraft(
      'Вот результат:\n```json\n{"amount": 500, "type": "EXPENSE", "categoryId": "cat-food", "accountId": "acc-cash"}\n```',
      context
    );
    expect(draft.amount).toBe(500);
    expect(draft.accountId).toBe("acc-cash");
  });

  it("falls back to today's date when none is given or invalid", () => {
    const draft = parseTransactionDraft(
      '{"amount": 10, "type": "EXPENSE", "date": "вчера"}',
      context
    );
    expect(draft.date).toBe("2026-06-21");
  });

  it("drops ids that are not in the context", () => {
    const draft = parseTransactionDraft(
      '{"amount": 10, "type": "EXPENSE", "categoryId": "cat-unknown", "accountId": "acc-unknown"}',
      context
    );
    expect(draft.categoryId).toBeNull();
    expect(draft.accountId).toBeNull();
  });

  it("drops a category whose kind does not match the operation type", () => {
    // cat-salary is INCOME — must not attach to an EXPENSE draft.
    const draft = parseTransactionDraft(
      '{"amount": 10, "type": "EXPENSE", "categoryId": "cat-salary"}',
      context
    );
    expect(draft.categoryId).toBeNull();
  });

  it("normalizes amount to two decimals and empty description to null", () => {
    const draft = parseTransactionDraft(
      '{"amount": 12.345, "type": "INCOME", "description": "   ", "categoryId": "cat-salary"}',
      context
    );
    expect(draft.amount).toBe(12.35);
    expect(draft.description).toBeNull();
    expect(draft.categoryId).toBe("cat-salary");
  });

  it("throws on a non-JSON reply", () => {
    expect(() => parseTransactionDraft("извините, не понял", context)).toThrow();
  });

  it("rejects a non-positive amount", () => {
    expect(() => parseTransactionDraft('{"amount": 0, "type": "EXPENSE"}', context)).toThrow();
  });
});
