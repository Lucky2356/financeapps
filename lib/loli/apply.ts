// Траты Лоли — в учёт или в «Подсказки» (см. lib/loli/inbox.ts).
//
// Отдельно от экрана, с учётом и памятью устройства, переданными снаружи, —
// чтобы проверки гоняли настоящий учёт (LocalApiClient), а не подделку.

import type { ApiClient } from "@/lib/api/ApiClient";
import {
  BANK_HANDLED_KEY,
  BANK_SUGGESTIONS_KEY,
  mergeSuggestions,
  parseHandled,
  parseStored
} from "@/lib/bank/suggestions";
import {
  LOLI_LINKS_KEY,
  LOLI_PREFIX,
  loliAccount,
  loliCategory,
  loliSuggestion,
  parseLinks,
  withLink,
  type LoliItem
} from "@/lib/loli/inbox";

type Api = Pick<ApiClient, "get" | "post" | "put" | "delete">;

type Row = {
  id: string;
  type: string;
  description: string | null;
  account: { id: string };
  category: { id: string };
};

type Ledger = {
  transactions: Row[];
  accounts: Array<{ id: string; currency?: string; isArchived?: boolean }>;
  categories: Array<{ id: string; label: string; kind: string }>;
};

export type LoliDeps = {
  api: Api;
  read(key: string): string | null;
  write(key: string, value: string): void;
  /** Записывать сразу (настройка «Записывать сразу»), а не в «Подсказки». */
  auto: boolean;
  /** Последний счёт, которым платили, — с него и пишем. */
  lastAccount: string | null;
  /** Кто на этом телефоне в семье — трата его (family-fields, deviceMember). */
  member(type: "EXPENSE" | "INCOME"): Record<string, string>;
  now: number;
};

export type LoliOutcome = {
  recorded: Array<{ amount: number; currency: string; category: string }>;
  suggested: number;
  updated: number;
  removed: number;
};

const money = (minor: number) => String(Math.round(minor) / 100);

export async function applyLoliItems(
  items: readonly LoliItem[],
  deps: LoliDeps
): Promise<LoliOutcome> {
  const outcome: LoliOutcome = { recorded: [], suggested: 0, updated: 0, removed: 0 };
  if (items.length === 0) return outcome;

  const ledger: Ledger = await deps.api.get("/transactions?period=all&limit=all");
  const rows = new Map(ledger.transactions.map((row) => [row.id, row]));
  const history = ledger.transactions.slice(0, 500).map((row) => ({
    description: row.description,
    type: (row.type === "INCOME" ? "INCOME" : "EXPENSE") as "INCOME" | "EXPENSE",
    category: { id: row.category.id }
  }));
  let links = parseLinks(deps.read(LOLI_LINKS_KEY));
  let suggestions = parseStored(deps.read(BANK_SUGGESTIONS_KEY));
  const handled = parseHandled(deps.read(BANK_HANDLED_KEY));
  const dropSuggestion = (id: string) => {
    suggestions = suggestions.filter((item) => item.id !== `${LOLI_PREFIX}${id}`);
  };
  // Помнить сделанное после КАЖДОЙ траты: оборвись разбор посередине, очередь
  // телефона отдаст те же траты снова, и записанные узнаются по связи, а не
  // запишутся второй раз.
  const keep = () => {
    deps.write(LOLI_LINKS_KEY, JSON.stringify(links));
    deps.write(BANK_SUGGESTIONS_KEY, JSON.stringify(suggestions));
  };

  // Старые сначала: «записала» и следом «отмени» должны лечь в этом порядке.
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    const linked = links[item.id];
    const row = linked ? rows.get(linked) : undefined;

    if (item.op === "delete") {
      dropSuggestion(item.id);
      if (row) {
        await deps.api.delete(`/transactions?id=${encodeURIComponent(row.id)}`);
        rows.delete(row.id);
        outcome.removed += 1;
      }
      links = withLink(links, item.id, null);
      keep();
      continue;
    }

    const categoryId = loliCategory(item, ledger.categories, history);

    if (linked) {
      // Уже записана, а потом удалена здесь руками — человек решил, Лоли не спорит.
      if (!row) {
        links = withLink(links, item.id, null);
        keep();
        continue;
      }
      await deps.api.put("/transactions", {
        id: row.id,
        amount: money(item.amountMinor),
        type: item.type,
        accountId: row.account.id,
        categoryId: categoryId ?? row.category.id,
        date: item.date,
        description: item.description || row.description || ""
      });
      outcome.updated += 1;
      keep();
      continue;
    }

    const accountId = loliAccount(item.currency, ledger.accounts, deps.lastAccount);
    if (deps.auto && accountId && categoryId) {
      dropSuggestion(item.id);
      const created = await deps.api.post("/transactions", {
        amount: money(item.amountMinor),
        type: item.type,
        accountId,
        categoryId,
        date: item.date,
        description: item.description,
        ...deps.member(item.type)
      });
      links = withLink(links, item.id, created.id);
      keep();
      const label = ledger.categories.find((category) => category.id === categoryId)?.label ?? "";
      outcome.recorded.push({
        amount: Math.round(item.amountMinor) / 100,
        currency: item.currency,
        category: label
      });
      continue;
    }

    // В «Подсказки». Правка ещё не записанной — та же подсказка, обновлённая.
    suggestions = mergeSuggestions(suggestions, [loliSuggestion(item)], deps.now, handled);
    outcome.suggested += 1;
    keep();
  }

  keep();
  return outcome;
}
