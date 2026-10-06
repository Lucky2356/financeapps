// Категории и правила: справочник категорий, правила авто-категоризации и
// факт по категориям для таблицы.

import type { CategoriesPageData, RulesPageData } from "@/lib/data";
import { id, toFormObject } from "@/lib/api/local/helpers";
import type { SheetImport } from "@/lib/api/local/sheet";
import type { CategorizationRule } from "@/lib/categorization-rules";
import { roundMoney } from "@/lib/utils";
import type { CategoryRow } from "@/types/finance";
import {
  type CategoryOption,
  type LocalState,
  STANDARD_CATEGORY_IDS,
  withCurrentNames
} from "@/lib/api/local/state";

export function rulesPage(state: LocalState): RulesPageData {
  return {
    source: "database",
    rules: [...state.rules],
    categories: state.categories.map((category) => ({
      id: category.id,
      label: category.label,
      kind: category.kind
    }))
  };
}

export function addRule(state: LocalState, body: unknown) {
  const input = toFormObject(body);
  const match = input.match?.trim();
  const categoryId = input.categoryId?.trim();
  if (!match || !categoryId) throw new Error("Укажите текст и категорию для правила.");
  if (!state.categories.some((category) => category.id === categoryId)) {
    throw new Error("Выберите существующую категорию.");
  }
  const rule: CategorizationRule = { id: id("rule"), match, categoryId };
  state.rules = [rule, ...state.rules];
  return rule;
}

export function categoriesPage(state: LocalState): CategoriesPageData {
  const categories: CategoryRow[] = state.categories.map((cat) => ({
    id: cat.id,
    name: cat.label,
    kind: cat.kind,
    color: cat.color,
    icon: cat.icon,
    isEssential: cat.isEssential ?? false,
    isSubscription: cat.isSubscription ?? false,
    isStandard: STANDARD_CATEGORY_IDS.has(cat.id),
    transactionCount: state.transactions.filter((t) => t.category.id === cat.id).length
  }));
  return { source: "database", categories };
}

/**
 * Перенос таблицы из Excel. Столбцам «создать категорию» категории
 * заводятся здесь же (или берутся уже существующие с тем же именем), чтобы
 * «Продукты» из таблицы сразу открывали операции.
 */
/**
 * Перенос из Excel: столбцы, которым человек велел «создать категорию»,
 * получают её здесь — у листа нет доступа к справочнику категорий.
 */
export function withSheetCategories(state: LocalState, raw: unknown): SheetImport {
  const payload = raw as SheetImport & {
    columns: Array<SheetImport["columns"][number] & { createCategory?: "INCOME" | "EXPENSE" }>;
  };
  if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.rows))
    throw new Error("Нечего переносить.");
  for (const column of payload.columns) {
    if (!column.createCategory || column.categoryId) continue;
    const same = state.categories.find(
      (category) =>
        category.kind === column.createCategory &&
        category.label.trim().toLowerCase() === column.name.trim().toLowerCase()
    );
    column.categoryId =
      same?.id ??
      upsertCategory(state, { name: column.name, kind: column.createCategory }, "POST").id;
  }
  return payload;
}

/** Факт из учёта по категориям и месяцам — для «Сравнить с учётом» в таблице. */
export function sheetFacts(state: LocalState, from: string, to: string) {
  const months: Record<string, Record<string, number>> = {};
  for (const row of state.transactions) {
    const month = row.date.slice(0, 7);
    if ((from && month < from) || (to && month > to)) continue;
    const bucket = (months[month] ??= {});
    bucket[row.category.id] = roundMoney((bucket[row.category.id] ?? 0) + row.amount);
  }
  return { months };
}

export function upsertCategory(state: LocalState, body: unknown, method: "POST" | "PUT") {
  const input = toFormObject(body);
  const name = (input.name ?? "").trim();
  const kind = (input.kind ?? "EXPENSE") as "INCOME" | "EXPENSE";
  const color = input.color ?? "#64748b";
  // The picture travels with the category into every screen that lists it,
  // including operations already recorded under it.
  const icon = input.icon?.trim() || undefined;
  const isEssential = input.isEssential === "true" || input.isEssential === "on";
  const isSubscription = input.isSubscription === "true" || input.isSubscription === "on";

  if (name.length < 2) throw new Error("Название слишком короткое");

  if (method === "PUT" && input.id) {
    const existing = state.categories.find((c) => c.id === input.id);
    if (!existing) throw new Error("Категория не найдена.");
    // Check uniqueness
    const duplicate = state.categories.find(
      (c) => c.id !== input.id && c.kind === kind && c.label.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw new Error("Категория с таким именем уже существует.");

    const updated: CategoryOption = {
      ...existing,
      label: name,
      kind,
      color,
      icon,
      isEssential,
      isSubscription
    };
    state.categories = state.categories.map((c) => (c.id === input.id ? updated : c));
    // Update category label/colour/icon in existing transactions
    state.transactions = state.transactions.map((t) =>
      t.category.id === input.id
        ? { ...t, category: { ...t.category, label: name, color, icon } }
        : t
    );
    // И в шаблонах плановых — иначе они так и показывали бы прежнее имя.
    state.recurringTransactions = state.recurringTransactions.map((item) =>
      item.category.id === input.id ? withCurrentNames(state, item) : item
    );
    return updated;
  }

  // POST - create new
  const duplicate = state.categories.find(
    (c) => c.kind === kind && c.label.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) throw new Error("Категория с таким именем уже существует.");

  const category: CategoryOption = {
    id: id("cat"),
    label: name,
    kind,
    color,
    icon,
    isEssential,
    isSubscription
  };
  state.categories = [...state.categories, category];
  return category;
}
