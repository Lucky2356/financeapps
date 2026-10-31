"use client";

import { matchRule } from "@/lib/categorization-rules";
import { suggestCategoryId } from "@/lib/category-suggest";
import type { TransactionsPageData } from "@/lib/data";
import { parseEntry, type ParsedEntry } from "@/lib/transactions/parse-entry";

import type { QuickAddForm } from "@/components/quick-add-fab/use-quick-add-form";

/** Поле «наше», пока в нём стоит ровно то, что вписал разбор, или пусто. */
function ours(current: string, written: string): boolean {
  return current === "" || current === written;
}

/** Разбор описания по полям и категория по тексту. */
export function useQuickAddSuggestions(form: QuickAddForm) {
  const {
    type,
    setType,
    amount,
    setAmount,
    accountId,
    setAccountId,
    date,
    setDate,
    tags,
    setTags,
    filledIn,
    setFilledIn,
    setCategoryId,
    setAutoSuggested,
    manualCategory,
    setDescription,
    setCleanedDescription,
    ledger,
    activeAccounts,
    filteredCategories
  } = form;

  // Одна строка вместо формы. Человек пишет «1200 продукты картой» в описание —
  // сумма, счёт, дата и теги расходятся по своим полям на глазах, и любое из
  // них можно тут же поправить: с этого момента разбор в него не пишет.
  //
  // Само описание остаётся ровно таким, каким его набрали: подменять текст под
  // курсором — верный способ испортить набор на середине слова. В журнал уйдёт
  // очищенное, и об этом сказано строкой ниже поля.
  //
  // A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
  // wins even after a category was picked by hand. The history heuristic is a
  // softer guess and only fills in while nothing has been chosen.
  /** Раскладывает разобранное по полям, не трогая поправленное руками. */
  function fillFromParsed(parsed: ParsedEntry) {
    const written = { ...filledIn };
    if (parsed.amount !== null && ours(amount, filledIn.amount)) {
      written.amount = String(parsed.amount);
      setAmount(written.amount);
    }
    if (parsed.accountId && ours(accountId, filledIn.accountId)) {
      written.accountId = parsed.accountId;
      setAccountId(parsed.accountId);
    }
    if (parsed.date && ours(date, filledIn.date)) {
      written.date = parsed.date;
      setDate(parsed.date);
    }
    if (parsed.tags.length > 0 && ours(tags, filledIn.tags)) {
      written.tags = parsed.tags.join(", ");
      setTags(written.tags);
    }
    setFilledIn(written);
    // Знак перед суммой — единственное, что меняет тип: «+5000» это доход.
    if (parsed.type && parsed.type !== type) setType(parsed.type);
  }

  /**
   * Категория по тексту.
   *
   * A user-defined rule is an explicit mapping ("Пятёрочка" → Продукты), so it
   * wins even after a category was picked by hand. The history heuristic is a
   * softer guess and only fills in while nothing has been chosen.
   */
  function suggestCategoryFor(
    text: string,
    rules: TransactionsPageData["rules"],
    history: TransactionsPageData["transactions"]
  ) {
    const known = (id: string) => filteredCategories.some((category) => category.id === id);

    const ruled = rules.length > 0 ? matchRule(text, rules) : null;
    if (ruled && known(ruled)) {
      setCategoryId(ruled);
      setAutoSuggested(true);
      return;
    }
    if (manualCategory) return;
    const suggestion = suggestCategoryId(text, history, {
      type: type === "INCOME" ? "INCOME" : "EXPENSE",
      rules
    });
    if (suggestion && known(suggestion)) {
      setCategoryId(suggestion);
      setAutoSuggested(true);
    } else {
      setAutoSuggested(false);
    }
  }

  function onDescriptionChange(value: string) {
    setDescription(value);
    if (type === "TRANSFER" || !ledger) return;

    const parsed = parseEntry(value, {
      accounts: activeAccounts.map((account) => ({ id: account.id, label: account.name })),
      history: ledger.transactions,
      rules: ledger.rules,
      type: type === "INCOME" ? "INCOME" : "EXPENSE",
      today: new Date()
    });

    fillFromParsed(parsed);
    setCleanedDescription(parsed.description === value.trim() ? null : parsed.description);
    suggestCategoryFor(parsed.description || value, ledger.rules, ledger.transactions);
  }

  return { onDescriptionChange };
}
