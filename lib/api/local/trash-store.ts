// Корзина в хранилище: положить удалённое, показать, вернуть, выбросить.
// Корзина лежит рядом с книгой профиля — под её ключом с TRASH_SUFFIX.
// Чистые функции корзины — в lib/trash/trash.ts; здесь то, что их хранит и
// зовёт. Вынесено из LocalApiClient; зовётся через StoreContext.

import { id } from "@/lib/api/local/helpers";
import {
  releaseTrashedPayments,
  restoreTransaction,
  restoreTransactionOnReturnedAccount
} from "@/lib/api/local/ledger";
import { getActiveProfileId, profileStateKey } from "@/lib/api/local/profiles";
import type { LocalState } from "@/lib/api/local/state";
import type { StoreContext } from "@/lib/api/local/store-context";
import { apiText } from "@/lib/i18n/api-text";
import { TRASH_SUFFIX } from "@/lib/storage/SyncingStorageAdapter";
import { transferKeyOf } from "@/lib/transactions/transfers";
import {
  addToTrash,
  pruneTrash,
  SHEET_ARCHIVE,
  readTrash,
  trashAmount,
  trashTitle,
  type vanishedRows,
  type TrashEntry,
  type TrashOrigin
} from "@/lib/trash/trash";

/** Какие строки корзины: `ids` в теле. */
export function trashIds(body: unknown): string[] {
  const ids = (body as { ids?: unknown } | null)?.ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export async function putInTrash(
  ctx: StoreContext,
  stateKey: string,
  gone: ReturnType<typeof vanishedRows>,
  origin: TrashOrigin
): Promise<void> {
  if (gone.length === 0) return;
  try {
    const key = `${stateKey}${TRASH_SUFFIX}`;
    const trash = readTrash(await ctx.storage.getItem<unknown>(key));
    await ctx.storage.setItem(key, {
      v: 1,
      entries: addToTrash(trash, gone, new Date().toISOString(), origin, () => id("trash"))
    });
  } catch {
    /* корзина — страховка; книга уже записана, и падать из-за неё нельзя */
  }
}

async function trashKey(ctx: StoreContext): Promise<string> {
  return `${profileStateKey(await getActiveProfileId(ctx))}${TRASH_SUFFIX}`;
}

async function trashEntries(ctx: StoreContext): Promise<TrashEntry[]> {
  const key = await trashKey(ctx);
  return pruneTrash(readTrash(await ctx.storage.getItem<unknown>(key)), new Date().toISOString());
}

export async function trashList(ctx: StoreContext) {
  const entries = await trashEntries(ctx);
  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      collection: entry.collection,
      title: trashTitle(entry),
      amount: trashAmount(entry),
      currency: typeof entry.row.currency === "string" ? entry.row.currency : "RUB",
      type: typeof entry.row.type === "string" ? entry.row.type : null,
      date: typeof entry.row.date === "string" ? entry.row.date : null,
      deletedAt: entry.deletedAt,
      origin: entry.origin
    }))
  };
}

/**
 * Вернуть из корзины. Сначала счета и категории, потом то, что на них
 * ссылается: удалили счёт вместе с операциями — вернуть надо в том же порядке.
 */
export async function restoreFromTrash(ctx: StoreContext, state: LocalState, ids: string[]) {
  const order = [
    "sheets",
    "accounts",
    "categories",
    "liabilities",
    "goals",
    "budgets",
    "rules",
    "recurringTransactions",
    "cashbackRules",
    "trips",
    "sheetColumns",
    "sheetTargets",
    "members",
    "familySettlements",
    "transactions"
  ];
  const all = await trashEntries(ctx);
  // Перевод — две операции. Вернуть одну значило бы оставить деньги
  // ушедшими со счёта и никуда не пришедшими: вторая половина идёт следом.
  const transferOf = (entry: TrashEntry) =>
    entry.collection === "transactions"
      ? transferKeyOf(entry.row as { description: string | null; transferId?: string })
      : null;
  const transfers = new Set(
    all
      .filter((entry) => ids.includes(entry.id))
      .map(transferOf)
      .filter((value): value is string => value !== null)
  );
  const entries = all
    .filter((entry) => {
      const transfer = transferOf(entry);
      return ids.includes(entry.id) || (transfer !== null && transfers.has(transfer));
    })
    .sort((a, b) => order.indexOf(a.collection) - order.indexOf(b.collection));
  if (entries.length === 0) throw new Error(apiText("api.trash.gone"));
  const holder = state as unknown as Record<string, unknown>;
  const restored: string[] = [];
  const failed: string[] = [];
  // Счёт, возвращаемый вместе со своими операциями, уже несёт остаток с ними:
  // провести операции по нему ещё раз значило бы удвоить деньги.
  const accountsBack = new Set<string>();
  const restoreOne = (entry: TrashEntry) => {
    const { updatedAt: _stamp, ...row } = entry.row;
    void _stamp;
    if (entry.collection === "transactions") {
      const accountId = (row.account as { id?: unknown } | undefined)?.id;
      if (typeof accountId === "string" && accountsBack.has(accountId)) {
        restoreTransactionOnReturnedAccount(state, row);
      } else {
        restoreTransaction(state, { transaction: row });
      }
    } else {
      // Лист (и столбец) возвращается вместе со всем, что на нём было.
      const content = row[SHEET_ARCHIVE] as Record<string, unknown[]> | undefined;
      delete row[SHEET_ARCHIVE];
      if (content) {
        for (const [collection, list] of Object.entries(content)) {
          const present = Array.isArray(holder[collection])
            ? (holder[collection] as Array<Record<string, unknown>>)
            : [];
          const ids = new Set(present.map((item) => item.id));
          holder[collection] = [
            ...present,
            ...(list as Array<Record<string, unknown>>)
              .filter((item) => !ids.has(item.id))
              .map(({ updatedAt: _at, ...rest }) => (void _at, rest))
          ];
        }
      }
      const rows = Array.isArray(holder[entry.collection])
        ? (holder[entry.collection] as Array<Record<string, unknown>>)
        : [];
      if (!rows.some((item) => item.id === row.id)) {
        // Цель при удалении отдала деньги на счёт (см. remove, /goals): вернуть
        // её с прежней суммой значило бы посчитать эти деньги дважды.
        if (entry.collection === "goals") Object.assign(row, { currentAmount: 0, progress: 0 });
        holder[entry.collection] = [...rows, row];
        if (entry.collection === "accounts" && typeof row.id === "string") accountsBack.add(row.id);
        // Платежи из корзины, сидящие в остатке долга, — вон из него: каждый
        // снимется с долга сам, когда вернётся (см. releaseTrashedPayments).
        if (entry.collection === "liabilities") releaseTrashedPayments(state, entry, all);
      }
    }
  };
  // Перевод возвращается целиком или никак. Половины проверялись по одной:
  // счёт получателя за это время убрали — расход возвращался (со счёта
  // снова уходили 300), доход падал с «счёт удалён» и оставался в корзине,
  // а одинокая половина перевода не входит в итоги — 300 просто исчезали.
  // Поэтому половины одного перевода — одна группа: упала одна — документ
  // возвращается к состоянию до группы, и обе остаются в корзине.
  const groups: TrashEntry[][] = [];
  const byTransfer = new Map<string, TrashEntry[]>();
  for (const entry of entries) {
    const transfer = transferOf(entry);
    const group = transfer === null ? undefined : byTransfer.get(transfer);
    if (group) {
      group.push(entry);
      continue;
    }
    const fresh = [entry];
    if (transfer !== null) byTransfer.set(transfer, fresh);
    groups.push(fresh);
  }
  for (const group of groups) {
    // Возврат меняет документ, заменяя массивы целиком (state.transactions =
    // [...], applyBalance), а не правя их на месте, — поэтому для отката
    // достаточно запомнить прежние ссылки.
    const before = { ...holder };
    try {
      for (const entry of group) restoreOne(entry);
      restored.push(...group.map((entry) => entry.id));
    } catch (error) {
      for (const key of Object.keys(holder)) if (!(key in before)) delete holder[key];
      Object.assign(holder, before);
      failed.push(error instanceof Error ? error.message : String(error));
    }
  }
  await ctx.save(state);
  const key = await trashKey(ctx);
  const left = readTrash(await ctx.storage.getItem<unknown>(key)).filter(
    (entry) => !restored.includes(entry.id)
  );
  await ctx.storage.setItem(key, { v: 1, entries: left });
  return { restored: restored.length, failed };
}

export async function purgeTrash(ctx: StoreContext, ids: string[] | "all") {
  const key = await trashKey(ctx);
  const entries = readTrash(await ctx.storage.getItem<unknown>(key));
  const left = ids === "all" ? [] : entries.filter((entry) => !ids.includes(entry.id));
  await ctx.storage.setItem(key, { v: 1, entries: left });
  return { removed: entries.length - left.length };
}
