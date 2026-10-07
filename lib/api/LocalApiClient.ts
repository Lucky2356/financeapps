"use client";

import type { ApiClient } from "@/lib/api/ApiClient";
import type {
  DeletePath,
  PathWithQuery,
  ReadPath,
  ReadResponses,
  WriteResponse,
  WriteRoute
} from "@/lib/api/routes";
import { MARKET_READS, STATE_READS, type ReadRequest } from "@/lib/api/local/reads";
import {
  byAction,
  PRICED_WRITES,
  STATE_DELETES,
  STATE_WRITES,
  type DeleteRequest,
  type WriteRequest
} from "@/lib/api/local/writes";
import { id, normalizePath, routeOf, toFormObject } from "@/lib/api/local/helpers";
import { freezeLedgerOutsideProduction } from "@/lib/api/freeze-state";
import { STAMPED, stampRows, trackDeletions } from "@/lib/sync/row-stamps";
import { localStateSchema, transactionRowSchema } from "@/lib/api/local/schemas";
import {
  BEFORE_CLEAR_SUFFIX,
  LOCAL_COPY_SUFFIX,
  TRASH_SUFFIX,
  PRE_UPGRADE_SUFFIX,
  RESCUE_SUFFIX
} from "@/lib/storage/SyncingStorageAdapter";
import {
  isPhotoData,
  orphanedPhotos,
  PHOTO_MAX_CHARS,
  PHOTO_PREFIX,
  photoKey,
  type PhotoPlace,
  type StoredPhoto
} from "@/lib/photos/receipt-photo";
import { todayDay } from "@/lib/transactions/date";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { salvageLocalState } from "@/lib/api/local/schemas";
import { transferKeyOf } from "@/lib/transactions/transfers";
import { isoDay } from "@/lib/net-worth-snapshots";
import { recordPortfolioSnapshot } from "@/lib/investments/snapshots";
import type { TransactionRow } from "@/types/finance";
import { SAMPLE_PROFILE_ID, type ProfileList, type UserProfile } from "@/types/profiles";
import {
  addToTrash,
  pruneTrash,
  SHEET_ARCHIVE,
  readTrash,
  trashAmount,
  trashTitle,
  vanishedRows,
  type TrashEntry,
  type TrashOrigin
} from "@/lib/trash/trash";
import {
  type LocalState,
  standardCategoriesFrom,
  createInitialState,
  createBlankState,
  migrateLocalState
} from "@/lib/api/local/state";
import { restoreTransaction } from "@/lib/api/local/ledger";
import { investmentsPage, marketPricesFor, type MarketPrices } from "@/lib/api/local/investments";
import { backupDocument } from "@/lib/api/local/settings";
import { buildSampleState } from "@/lib/api/local/sample";

// Прежде жили здесь — потребители импортируют их отсюда.
export {
  STANDARD_CATEGORY_IDS,
  spendingPlan,
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID
} from "@/lib/api/local/state";

const LEGACY_STATE_KEY = "localFinanceState";
const PROFILE_LIST_KEY = "profileList";

/** Книга до перевода на новую схему — то, что отдаёт `/backup/before-upgrade`. */
export type PreUpgradeBackup = {
  savedAt: string | null;
  fromVersion: number | null;
  toVersion: number | null;
  backup: Record<string, unknown>;
};

/** Что отдаёт `/backup/before-clear`: когда очистили и до какого числа можно вернуть. */
export type BeforeClearCopy = { savedAt: string; until: string };

function localCopyKey(id: string): string {
  return `${LOCAL_COPY_PREFIX}${id}${LOCAL_COPY_SUFFIX}`;
}

/** Копия всего, что было до «Очистить все данные». Живёт неделю. */
const BEFORE_CLEAR_KEY = `financeProfiles${BEFORE_CLEAR_SUFFIX}`;
const BEFORE_CLEAR_DAYS = 7;

/**
 * Копия всех данных на этом устройстве — что отдаёт `/backup/local-copies`.
 *
 * `daily` — сама, раз в день на главном устройстве; `manual` — по кнопке;
 * `before-restore` — отложенная перед «Вернуть», чтобы и возврат можно было
 * отменить.
 */
export type LocalCopy = {
  id: string;
  savedAt: string;
  reason: "daily" | "manual" | "before-restore";
  operations: number;
};

const LOCAL_COPY_INDEX_KEY = `financeCopies${LOCAL_COPY_SUFFIX}`;
const LOCAL_COPY_PREFIX = "financeCopy_";
/** Две недели ежедневных копий — и ещё место для ручных. */
export const LOCAL_COPIES_KEEP = 14;

type LocalCopyStored = {
  savedAt: string;
  list: ProfileList;
  states: Record<string, unknown>;
};

type BeforeClearStored = {
  savedAt: string;
  list: ProfileList;
  states: Record<string, unknown>;
};

function profileStateKey(profileId: string): string {
  return `localFinanceState_${profileId}`;
}

const DEFAULT_PROFILE: UserProfile = {
  id: "profile-default",
  name: "Основной",
  color: "#0d9488",
  createdAt: "1970-01-01T00:00:00.000Z"
};

/**
 * Книга для записи — без копирования строк.
 *
 * Запись меняет книгу так: подменяет раздел целиком (`state.accounts =
 * state.accounts.map(…)`), добавляет в него строку или переписывает поле
 * раздела-объекта (`state.investments.watchlist = …`). Для этого достаточно
 * свежих разделов и свежих объектов первого уровня; сами строки, которых
 * запись не касалась, остаются общими с кэшем. Раньше книга копировалась
 * целиком (structuredClone) — на двадцати тысячах операций это ~70 мс на
 * каждое сохранение, и ещё столько же уходило на сличение каждой строки с
 * прежней при отметке времени: копия — всегда «другой» объект. Общие строки
 * отметка узнаёт сразу (row-stamps, decide).
 *
 * Правка строки на месте была бы порчей кэша — вне поставки он заморожен
 * вглубь (freeze-state.ts), и такая правка падает на первом же тесте.
 */
function writableCopy<T>(state: T): T {
  const copy = { ...(state as Record<string, unknown>) };
  for (const [key, value] of Object.entries(copy)) {
    if (Array.isArray(value)) copy[key] = [...value];
    else if (value !== null && typeof value === "object") copy[key] = { ...value };
  }
  return copy as T;
}

/** Какие строки корзины: `ids` в теле. */
function trashIds(body: unknown): string[] {
  const ids = (body as { ids?: unknown } | null)?.ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export class LocalApiClient implements ApiClient {
  constructor(private readonly storage: StorageAdapter = createStorageAdapter()) {}

  // In-memory cache of the active profile's parsed state, keyed by its storage
  // key. Reads return a deep clone so a handler that mutates-then-throws can't
  // poison the cache; save() refreshes it and storage-bypassing writes (clear,
  // profile ops) call invalidateStateCache(). Avoids re-reading and Zod-parsing
  // storage on every request (plan A4).
  private stateCache: { key: string; state: LocalState } | null = null;

  /**
   * Книга, какой она была до того, как синхронизация подменила её снизу. Нужна
   * корзине: сличив её со слитой, видно, что удалили на другом устройстве.
   */
  private remoteBaseline: { key: string; state: LocalState } | null = null;

  private invalidateStateCache() {
    this.stateCache = null;
  }

  /**
   * Книгу подменили ПОД клиентом — забыть запомненное.
   *
   * Зовёт это синхронизация: она пишет слитую книгу в хранилище напрямую, ниже
   * этого слоя, и о её записи клиент узнать ниоткуда не может. Кэш при этом
   * держит книгу, прочитанную до слияния, и следующее чтение отдало бы вчерашние
   * числа — причём отдало бы их и после того, как экран честно перечитал себя.
   *
   * Отдельным именем, а не через invalidateStateCache: тот приватный и зовётся
   * там, где книгу меняет сам клиент. Здесь случай другой — снаружи и без него.
   */
  forgetCachedState(): void {
    // Первая подмена из нескольких подряд — та, с которой и сличать: книга до
    // неё — последняя, которую видел человек.
    if (!this.remoteBaseline && this.stateCache) this.remoteBaseline = this.stateCache;
    this.invalidateStateCache();
  }

  /**
   * Every change runs to completion before the next one starts.
   *
   * A change is read-modify-write over the WHOLE state, saved as one blob, so
   * two of them in flight at once means the second one saves a picture taken
   * before the first one happened — and the first is gone without a trace. It
   * is not a theoretical race: the background runner writes a capital snapshot
   * and refreshes rates on every load, and that is exactly when a person is
   * loading the example or adding an operation. Losing the example that way is
   * how it was found.
   */
  private pending: Promise<unknown> = Promise.resolve();

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    // The queue must survive a failed operation, so both paths continue it.
    const next = this.pending.then(operation, operation);
    this.pending = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Чтения, которым мало документа: копии, корзина, профили и фото лежат в
   * хранилище рядом с ним, а «/backup» и «/investments» попутно сохраняют то,
   * что узнали. Остальные чтения — в lib/api/local/reads.ts.
   */
  private readonly storeReads = {
    "/backup/before-upgrade": () => this.preUpgradeBackup(),
    "/backup/before-clear": () => this.beforeClearCopy(),
    "/backup/local-copies": () => this.localCopies(),
    "/trash": () => this.trashList(),
    "/profiles": () => this.profileList(),
    "/photos": ({ state, searchParams }: ReadRequest) =>
      this.readPhoto(state, searchParams.get("id") ?? ""),
    "/backup": ({ state }: ReadRequest) => this.exportBackup(state),
    "/investments": ({ state }: ReadRequest) => this.refreshInvestments(state)
  };

  async get<P extends ReadPath>(path: PathWithQuery<P>): Promise<ReadResponses[P]> {
    // Reads get the cached document itself rather than a copy of it. Cloning a
    // ledger of a few thousand operations costs more than everything the screen
    // then does with it — over half the time of a page load went into copying
    // data nobody was going to change. Read handlers build new objects and must
    // never touch this one; `tests/read-paths.test.ts` holds them to it.
    const state = await this.state(false);
    const { pathname, searchParams } = normalizePath(path);
    const handler =
      routeOf(STATE_READS, pathname) ??
      routeOf(MARKET_READS, pathname) ??
      routeOf(this.storeReads, pathname);
    if (!handler) throw new Error(`Local API route is not implemented: ${pathname}`);
    // Тип ответа пути выведен из этого же обработчика (lib/api/routes.ts), и
    // связать их здесь, где путь — уже просто строка, можно только приведением.
    // Оно одно на все чтения.
    return (await handler({ state, searchParams })) as ReadResponses[P];
  }

  /**
   * The exported file records when it was made, so the stamp goes into the
   * payload here — and into storage inside the queue, on a state read again,
   * so an export cannot roll back whatever was saved meanwhile.
   */
  private async exportBackup(state: LocalState) {
    const stamped = new Date().toISOString();
    const payload = await backupDocument({ ...state, lastBackupAt: stamped });
    await this.serialize(async () => {
      const fresh = await this.state();
      fresh.lastBackupAt = stamped;
      await this.save(fresh);
    });
    return payload;
  }

  private async refreshInvestments(state: LocalState) {
    const invData = await investmentsPage(state);
    // Persist last-known prices so they survive app restart. Read the state
    // again inside the queue first: fetching quotes takes seconds, and
    // whatever the owner saved meanwhile must not be rolled back by the
    // snapshot this request started from.
    await this.serialize(async () => {
      const fresh = await this.state();
      fresh.investments = {
        ...fresh.investments,
        securities: invData.securities,
        watchlist: invData.watchlist,
        portfolio: invData.portfolio,
        structure: invData.structure,
        sectorStructure: invData.sectorStructure,
        assetStructure: invData.assetStructure
      };
      // Снимок дня: портфель пуст — снимать нечего (иначе история
      // начиналась бы с нулей до первой покупки).
      if (invData.portfolio.length > 0) {
        fresh.portfolioSnapshots = recordPortfolioSnapshot(
          fresh.portfolioSnapshots ?? [],
          isoDay(new Date()),
          invData.portfolio.reduce((sum, row) => sum + row.currentValue, 0),
          invData.portfolio.reduce((sum, row) => sum + row.quantity * row.averageBuyPrice, 0)
        );
        invData.history = fresh.portfolioSnapshots;
      }
      await this.save(fresh);
    });
    return invData;
  }

  async post<P extends WriteRoute, const Body = undefined>(
    path: PathWithQuery<P>,
    body?: Body
  ): Promise<WriteResponse<P, Body>> {
    return this.enqueueWrite<WriteResponse<P, Body>>(path, body, "POST");
  }

  async put<P extends WriteRoute, const Body = undefined>(
    path: PathWithQuery<P>,
    body?: Body
  ): Promise<WriteResponse<P, Body>> {
    return this.enqueueWrite<WriteResponse<P, Body>>(path, body, "PUT");
  }

  /**
   * Поставить запись в очередь. Обычная встаёт сразу, в порядке вызова.
   *
   * Запись, которой нужны цены с биржи (PRICED_WRITES), сначала получает их —
   * ДО очереди, а не в ней: биржу ждут секундами, и всё это время очередь
   * стояла бы. Документ для этого читается без очереди, как при любом чтении:
   * он нужен только затем, чтобы не ходить на биржу с пустым портфелем.
   * Портфель могут успеть поменять, пока ждём биржу, — обработчик считает по
   * документу, прочитанному уже в очереди, а бумага без полученной цены идёт
   * по своей последней.
   */
  private enqueueWrite<TResponse>(
    path: string,
    body: unknown,
    method: "POST" | "PUT"
  ): Promise<TResponse> {
    if (!PRICED_WRITES.has(normalizePath(path).pathname))
      return this.serialize(() => this.write<TResponse>(path, body, method));
    return this.state(false)
      .then(marketPricesFor)
      .then((prices) => this.serialize(() => this.write<TResponse>(path, body, method, prices)));
  }

  async delete(path: DeletePath): Promise<void> {
    return this.serialize(() => this.remove(path));
  }

  /**
   * Удаления, которым мало документа: фото лежит в хранилище отдельно от
   * операции, профиль и «Очистить все данные» — это само хранилище.
   * Остальные удаления — в lib/api/local/writes.ts.
   */
  private readonly storeDeletes = {
    "/photos": async ({ state, itemId }: DeleteRequest) => {
      if (!itemId) return false;
      const row = state.transactions.find((item) => item.id === itemId);
      if (row?.photo) await this.dropPhoto(itemId, row.photo);
      state.transactions = state.transactions.map((item) => {
        if (item.id !== itemId) return item;
        const { photo: _dropped, ...rest } = item;
        void _dropped;
        return rest;
      });
      await this.save(state);
      return true;
    },
    "/profiles": async ({ itemId }: DeleteRequest) => {
      if (!itemId) return false;
      await this.deleteProfile(itemId);
      return true;
    },
    "/storage/clear": async () => {
      await this.clearEverything();
      return true;
    }
  };

  private async remove(path: string): Promise<void> {
    const state = await this.state();
    const { pathname, searchParams } = normalizePath(path);
    const request: DeleteRequest = { state, searchParams, itemId: searchParams.get("id") };

    const change = routeOf(STATE_DELETES, pathname);
    if (change?.(request)) {
      await this.save(state);
      return;
    }
    const own = change ? undefined : routeOf(this.storeDeletes, pathname);
    if (own && (await own(request))) return;
    throw new Error(`Local API delete route is not implemented: ${pathname}`);
  }

  /**
   * Записи, которым мало документа: пример и профили — это отдельные книги
   * в хранилище, копии и корзина лежат рядом с книгой, фото — отдельно от
   * операции. Остальные записи — в lib/api/local/writes.ts.
   */
  private readonly storeWrites = {
    "/sample": async () => {
      // Пример — в своём профиле, а не поверх того, что человек уже завёл.
      // Раньше «Загрузить пример» ложился в текущие данные, и потом их надо
      // было чистить — вместе со своими, если успел что-то внести. Теперь
      // открывается профиль «Пример», а вернуться к своим — одна кнопка.
      await this.openSampleProfile();
      const sample = buildSampleState();
      await this.save(sample, { trash: false });
      return { loaded: true };
    },
    "/sample/leave": async ({ body }: WriteRequest) => {
      await this.leaveSampleProfile(toFormObject(body).remove === "true");
      return undefined;
    },
    "/sync/resolve": ({ state, body }: WriteRequest) => this.resolveConflict(state, body),
    "/backup": ({ body }: WriteRequest) => this.restoreBackup(body),
    "/backup/before-clear": async () => {
      await this.undoClear();
      return { restored: true };
    },
    "/backup/local-copies": byAction(
      {
        restore: async ({ body }: WriteRequest) => {
          await this.restoreLocalCopy(String((body as { id?: unknown } | null)?.id ?? ""));
          return { restored: true };
        },
        daily: () => this.dailyLocalCopy()
      },
      () => this.takeLocalCopy("manual")
    ),
    "/backup/merge": ({ body }: WriteRequest) => this.mergeBackup(body),
    "/trash": byAction(
      {
        restore: ({ state, body }: WriteRequest) => this.restoreFromTrash(state, trashIds(body)),
        empty: () => this.purgeTrash("all")
      },
      ({ body }: WriteRequest) => this.purgeTrash(trashIds(body))
    ),
    "/photos": ({ state, body }: WriteRequest) => this.attachPhoto(state, body),
    "/profiles/create": ({ body }: WriteRequest) => {
      const input = toFormObject(body);
      return this.createProfile(input.name ?? "Профиль", input.color ?? "#0d9488");
    },
    "/profiles/switch": async ({ body }: WriteRequest) => {
      await this.switchProfile(toFormObject(body).profileId ?? "");
      return undefined;
    },
    "/profiles/rename": async ({ body }: WriteRequest) => {
      const input = toFormObject(body);
      await this.renameProfile(input.profileId ?? "", input.name ?? "");
      return undefined;
    }
  };

  private async write<TResponse>(
    path: string,
    body: unknown,
    method: "POST" | "PUT",
    prices?: MarketPrices
  ): Promise<TResponse> {
    const state = await this.state();
    const { pathname } = normalizePath(path);
    const request: WriteRequest = { state, body, method, prices };

    // Обработчик правит документ и отвечает; сохраняется документ здесь, после
    // него, — и только если он не бросил ошибку.
    const change = routeOf(STATE_WRITES, pathname);
    // Тип ответа выводится из пути и `action` (lib/api/routes.ts); здесь путь
    // приходит строкой, и приведение к нему одно на все записи.
    if (change) return (await this.saveAndReturn(state, await change(request))) as TResponse;
    const own = routeOf(this.storeWrites, pathname);
    if (own) return (await own(request)) as TResponse;

    throw new Error(`Local API write route is not implemented: ${pathname}`);
  }

  private async saveAndReturn<T>(state: LocalState, value: T): Promise<T> {
    await this.save(state);
    return value;
  }

  private async restoreBackup(body: unknown) {
    const payload = (body as { backup?: unknown })?.backup;
    // Scheduled backups and folder sync write the document inside an envelope
    // (`{ exportedAt, backup }`); the button writes it bare. Accept either, so
    // any file the app itself produced can be restored.
    const document =
      payload && typeof payload === "object" && "backup" in payload
        ? (payload as { backup?: unknown }).backup
        : payload;
    const parsed = localStateSchema.safeParse(document);
    if (!parsed.success)
      throw new Error(
        "Файл не похож на резервную копию приложения — выберите файл, сохранённый кнопкой «Скачать backup»."
      );
    const restored = migrateLocalState(parsed.data);

    // The key does not travel in the file (see `backup`), so a copy carries an
    // empty one. Writing that over the key set on THIS machine would quietly
    // switch the AI features off on every restore, and the owner would go
    // looking for the fault in the wrong place. The machine keeps its own.
    const current = await this.state();
    if (!restored.aiApiKey) restored.aiApiKey = current.aiApiKey ?? "";

    await this.save(restored, { stamp: false });
    return { restored: true };
  }

  /**
   * Добавить к текущим данным записи из копии — «Объединить» при подключении.
   *
   * Устройство со своими записями подключается к другому: ключ и данные
   * приезжают оттуда, а свои записи, снятые копией до подключения, ложатся
   * сюда ДОБАВКОЙ. Ничего из уже лежащего здесь не заменяется.
   *
   * Одноимённые категории склеиваются: «Продукты» с двух устройств — это одни
   * «Продукты», и операции переводятся на ту, что уже есть. Счета — нет:
   * «Карта» на телефоне и «Карта» на ноутбуке могут быть разными картами, и
   * сложить их остатки значило бы соврать. Одинаковое имя получает «(2)», чтобы
   * было видно, что их два, — объединить или убрать лишний человек решит сам.
   */
  private async mergeBackup(body: unknown) {
    const payload = (body as { backup?: unknown })?.backup;
    const document =
      payload && typeof payload === "object" && "backup" in payload
        ? (payload as { backup?: unknown }).backup
        : payload;
    const parsed = localStateSchema.safeParse(document);
    if (!parsed.success) throw new Error("Не удалось прочитать записи для объединения.");
    const incoming = migrateLocalState(parsed.data);

    let added = 0;
    const state = await this.state();

    const categoryOf = new Map<string, LocalState["categories"][number]>();
    for (const category of incoming.categories) {
      const same =
        state.categories.find((existing) => existing.id === category.id) ??
        state.categories.find(
          (existing) =>
            existing.kind === category.kind &&
            existing.label.trim().toLowerCase() === category.label.trim().toLowerCase()
        );
      if (same) {
        categoryOf.set(category.id, same);
        continue;
      }
      state.categories.push(category);
      categoryOf.set(category.id, category);
    }
    const recategorize = <T extends { category: { id: string; label: string } }>(row: T): T => {
      const target = categoryOf.get(row.category.id);
      return target
        ? { ...row, category: { ...row.category, id: target.id, label: target.label } }
        : row;
    };

    const names = new Set(state.accounts.map((account) => account.name.trim().toLowerCase()));
    const accountIds = new Set(state.accounts.map((account) => account.id));
    for (const account of incoming.accounts) {
      if (accountIds.has(account.id)) continue;
      let name = account.name;
      for (let n = 2; names.has(name.trim().toLowerCase()); n += 1) name = `${account.name} (${n})`;
      names.add(name.trim().toLowerCase());
      state.accounts.push({ ...account, name });
      added += 1;
    }

    const addById = <T extends { id: string }>(target: T[], rows: T[], shape = (row: T) => row) => {
      const have = new Set(target.map((row) => row.id));
      for (const row of rows) {
        if (have.has(row.id)) continue;
        target.push(shape(row));
        added += 1;
      }
    };
    addById(state.transactions, incoming.transactions, (row) => {
      const moved = recategorize(row);
      const account = state.accounts.find((item) => item.id === moved.account.id);
      return account ? { ...moved, account: { ...moved.account, name: account.name } } : moved;
    });
    addById(state.recurringTransactions, incoming.recurringTransactions, recategorize);
    addById(state.goals, incoming.goals);
    state.goalMovements ??= [];
    addById(state.goalMovements, incoming.goalMovements ?? []);
    addById(state.liabilities, incoming.liabilities);
    addById(state.rules, incoming.rules);
    addById(
      state.budgets,
      incoming.budgets
        .map((budget) => ({
          ...budget,
          categoryId: categoryOf.get(budget.categoryId)?.id ?? budget.categoryId
        }))
        // Лимит на ту же категорию в тот же месяц уже есть — здешний главнее.
        .filter(
          (budget) =>
            !state.budgets.some(
              (existing) =>
                existing.categoryId === budget.categoryId &&
                (existing as { month?: string }).month === (budget as { month?: string }).month
            )
        )
    );

    await this.save(state);
    return { merged: added };
  }

  /**
   * The active profile's document. `mutable` (the default) hands back a copy,
   * so a handler that changes things — and may still throw — cannot poison the
   * cache; reads pass `false` and get the cached object itself, which is what
   * keeps a big ledger quick.
   */
  private async state(mutable = true) {
    const profileId = await this.getActiveProfileId();
    const key = profileStateKey(profileId);
    if (this.stateCache && this.stateCache.key === key) {
      return mutable ? writableCopy(this.stateCache.state) : this.stateCache.state;
    }
    const existing = await this.storage.getItem<unknown>(key);
    const parsed = localStateSchema.safeParse(existing);
    if (parsed.success) {
      const migrated = migrateLocalState(parsed.data);
      const storedVersion = (existing as { schemaVersion?: unknown })?.schemaVersion;
      if (migrated.schemaVersion !== storedVersion) {
        // Книга сейчас будет переписана в новом виде — и это единственная
        // секунда, когда прежняя ещё существует. Отложить её надо ЗДЕСЬ:
        // готовая выгрузка копии (`/backup`) читает книгу через это же место и
        // получит уже переведённую, то есть поймать прежнюю не может в принципе.
        await this.keepPreUpgradeCopy(
          key,
          existing,
          typeof storedVersion === "number" ? storedVersion : 1,
          migrated.schemaVersion
        );
        await this.storage.setItem(key, migrated);
      }
      this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(migrated)) };
      const baseline = this.remoteBaseline;
      this.remoteBaseline = null;
      if (baseline?.key === key) {
        await this.putInTrash(
          key,
          vanishedRows(
            baseline.state as unknown as Record<string, unknown>,
            migrated as unknown as Record<string, unknown>
          ),
          "elsewhere"
        );
      }
      return structuredClone(migrated);
    }
    // Nothing below may overwrite what is stored: the only reason we are here
    // is that this build cannot read it, and "cannot read" is not "may erase".
    // Replacing it with an empty state — which is what happened until 1.13.0 —
    // turns one bad row, or a file written by a newer build, into the loss of
    // every account, operation and plan.
    if (existing == null) {
      const initial = createInitialState();
      await this.storage.setItem(key, initial);
      this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(initial)) };
      return structuredClone(initial);
    }

    const storedVersion = (existing as { schemaVersion?: unknown })?.schemaVersion;
    if (typeof storedVersion === "number" && storedVersion > LATEST_LOCAL_STATE_VERSION)
      throw new Error(
        `Данные сохранены более новой версией приложения (формат ${storedVersion}). ` +
          "Обновите приложение — старая версия их не откроет."
      );

    await this.keepRescueCopy(key, existing);

    const salvaged = salvageLocalState(existing);
    if (!salvaged)
      throw new Error(
        "Не удалось прочитать сохранённые данные. Они не тронуты, копия отложена — " +
          "восстановите из резервной копии в настройках."
      );

    const migrated = migrateLocalState(salvaged.state);
    await this.storage.setItem(key, migrated);
    this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(migrated)) };
    return structuredClone(migrated);
  }

  /**
   * Puts the unreadable document aside before anything else touches the key.
   * Written once: a second failure must not overwrite the first rescue, which
   * is the one closest to the moment things went wrong.
   */
  /**
   * Книга, какой она была до перевода на новую схему, — или ничего, если
   * переводов ещё не было.
   *
   * Отдаётся в том же виде, что и обычная выгрузка, и это главное: в ней лежит
   * СТАРАЯ схема, и прежняя версия приложения примет такой файл своим обычным
   * «восстановить из копии». Ради этой одной возможности копия и держится.
   */
  private async preUpgradeBackup(): Promise<PreUpgradeBackup | null> {
    const profileId = await this.getActiveProfileId();
    const stored = await this.storage.getItem<unknown>(
      `${profileStateKey(profileId)}${PRE_UPGRADE_SUFFIX}`
    );
    if (!stored || typeof stored !== "object") return null;

    const record = stored as Record<string, unknown>;
    if (!record.document || typeof record.document !== "object") return null;

    // Ключ помощника из файла убирается — по той же причине, что и в обычной
    // выгрузке: файл уходит с машины, а ключ принадлежит машине.
    const document = { ...(record.document as Record<string, unknown>) };
    delete document.aiApiKey;

    return {
      savedAt: typeof record.savedAt === "string" ? record.savedAt : null,
      fromVersion: typeof record.fromVersion === "number" ? record.fromVersion : null,
      toVersion: typeof record.toVersion === "number" ? record.toVersion : null,
      backup: document
    };
  }

  private async keepRescueCopy(key: string, document: unknown) {
    const rescueKey = `${key}${RESCUE_SUFFIX}`;
    try {
      if ((await this.storage.getItem<unknown>(rescueKey)) == null)
        await this.storage.setItem(rescueKey, document);
    } catch {
      /* storage refused the copy — the original is still where it was */
    }
  }

  /**
   * Откладывает книгу такой, какой она была до перевода на новую схему.
   *
   * Схемы едут только вперёд, и миграции необратимы: «сложить два поля в одно»
   * нельзя разложить обратно, потому что раскладывать уже нечего. Значит
   * единственный способ вернуться — сохранить то, что было, пока оно есть.
   *
   * Нужно это ровно в одном случае, зато в важном: человек поставил себе
   * пробную сборку раньше остальных — а ради этого вся обкатка и заводилась, —
   * и она оказалась плохой. Без копии откат означает «книга не открывается
   * прежней версией»; с копией — «выгрузил файл, поставил прежнюю, развернул».
   *
   * Копия ОДНА и заменяется каждым переводом. Хранить все прежние ни к чему:
   * вернуться можно на шаг назад, а не на пять — приложения, читающего схему
   * пятилетней давности, всё равно уже нет, — и ряд копий рос бы без конца,
   * удваивая книгу на каждом обновлении.
   */
  private async keepPreUpgradeCopy(
    key: string,
    document: unknown,
    fromVersion: number,
    toVersion: number
  ) {
    try {
      await this.storage.setItem(`${key}${PRE_UPGRADE_SUFFIX}`, {
        savedAt: new Date().toISOString(),
        fromVersion,
        toVersion,
        document
      });
    } catch {
      // Хранилище отказало — скорее всего кончилось место. Перевод всё равно
      // продолжается: отказаться от него значило бы оставить человека с
      // приложением, которое не открывается вовсе. Но сказать правду стоит:
      // защиты на этот раз не будет, и узнает об этом только тот, кто читает
      // этот комментарий. Дверь в настройках покажет, что копии нет.
    }
  }

  /**
   * Единственная дверь, через которую книга попадает на диск.
   *
   * Здесь же строкам проставляется время последней правки: сличением с тем, что
   * лежало до этого, — изменившиеся и новые получают текущее время, нетронутые
   * сохраняют прежнее. Ставить отметки в обработчиках нельзя: их около
   * восьмидесяти, и восемьдесят первый её не поставит. Здесь — не забудет никто.
   *
   * `stamp: false` — для восстановления из копии: там отметки уже есть в файле и
   * означают, когда строку правили на самом деле. Переписать их на «сейчас»
   * значило бы объявить трёхлетнюю книгу целиком свежей.
   */
  /**
   * Решение человека по спорной строке.
   *
   * Обычная правка книги, а не особый путь: строка кладётся на своё место (или
   * убирается), и дальше всё идёт как всегда — отметка времени, след удаления,
   * отправка на сервер. Поэтому выбранное доезжает до второго устройства само и
   * ровно тем же порядком, что любая другая правка, а не отдельным механизмом,
   * который однажды разойдётся с основным.
   */
  private async resolveConflict(state: LocalState, body: unknown) {
    const input = body as { collection?: unknown; key?: unknown; row?: unknown };
    const collection = typeof input.collection === "string" ? input.collection : "";
    const key = typeof input.key === "string" ? input.key : "";

    const identify = STAMPED.find(([name]) => name === collection)?.[1];
    if (!identify) throw new Error(`Такого раздела в данных нет: ${collection}`);

    const holder = state as unknown as Record<string, unknown>;
    const rows = Array.isArray(holder[collection]) ? (holder[collection] as unknown[]) : [];
    const kept = rows.filter((row) => {
      if (typeof row !== "object" || row === null) return true;
      return identify(row as Record<string, unknown>) !== key;
    });

    // Пустой строки нет — значит, выбрали «здесь её удалили»: строка просто не
    // возвращается, а след удаления поставит сохранение, как и всегда.
    //
    // Отметку времени со строки снимать не нужно, хотя рука и тянется: точка
    // сохранения верному времени учит сама и отметке, пришедшей вместе со
    // строкой, не доверяет вовсе (см. row-stamps, decide).
    if (input.row && typeof input.row === "object") {
      kept.push({ ...(input.row as Record<string, unknown>) });
    }

    holder[collection] = kept;
    await this.save(state);
    return { resolved: true };
  }

  private async save(state: LocalState, options: { stamp?: boolean; trash?: boolean } = {}) {
    const profileId = await this.getActiveProfileId();
    const key = profileStateKey(profileId);
    const previous = await this.storedState(key);
    const now = new Date().toISOString();
    // Отметки и следы удалений ставятся ВМЕСТЕ и от одного сличения: строка,
    // исчезнувшая из книги, — это то же событие, что и правка, просто с другим
    // исходом. Разведи их по разным местам — однажды поставится одно без другого.
    const next =
      options.stamp === false
        ? state
        : trackDeletions(stampRows(state, previous, now), previous, now);
    await this.storage.setItem(key, next);
    // Без копии: следующая запись всё равно начнёт с writableCopy, а чтения
    // книгу не трогают (см. freeze-state.ts — вне поставки она заморожена).
    this.stateCache = { key, state: freezeLedgerOutsideProduction(next) };
    // Удалённое — в корзину. Сличаем записанное с прежним, как и для фото ниже:
    // мест, где что-то удаляют, слишком много, чтобы ловить каждое.
    // Загрузка примера переписывает книгу целиком — это не удаление.
    if (options.trash !== false) {
      await this.putInTrash(
        key,
        vanishedRows(previous, next as unknown as Record<string, unknown>),
        "here"
      );
    }
    // Операции не стало — не стало и её фото. Сличаем записанное с прежним,
    // а не ловим каждое место, где операцию удаляют: их много (одна, чек
    // целиком, выбранные, перевод), и одно забытое оставило бы фото навсегда.
    for (const gone of orphanedPhotos(
      (previous?.transactions as Array<{ id: string; photo?: PhotoPlace }> | undefined) ?? [],
      next.transactions
    )) {
      await this.dropPhoto(gone.id, gone.place);
    }
  }

  // ——— корзина ————————————————————————————————————————————————————

  private async putInTrash(
    stateKey: string,
    gone: ReturnType<typeof vanishedRows>,
    origin: TrashOrigin
  ): Promise<void> {
    if (gone.length === 0) return;
    try {
      const key = `${stateKey}${TRASH_SUFFIX}`;
      const trash = readTrash(await this.storage.getItem<unknown>(key));
      await this.storage.setItem(key, {
        v: 1,
        entries: addToTrash(trash, gone, new Date().toISOString(), origin, () => id("trash"))
      });
    } catch {
      /* корзина — страховка; книга уже записана, и падать из-за неё нельзя */
    }
  }

  private async trashKey(): Promise<string> {
    return `${profileStateKey(await this.getActiveProfileId())}${TRASH_SUFFIX}`;
  }

  private async trashEntries(): Promise<TrashEntry[]> {
    const key = await this.trashKey();
    return pruneTrash(
      readTrash(await this.storage.getItem<unknown>(key)),
      new Date().toISOString()
    );
  }

  private async trashList() {
    const entries = await this.trashEntries();
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
  private async restoreFromTrash(state: LocalState, ids: string[]) {
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
    const all = await this.trashEntries();
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
    if (entries.length === 0) throw new Error("В корзине этого уже нет.");
    const holder = state as unknown as Record<string, unknown>;
    const restored: string[] = [];
    const failed: string[] = [];
    // Счёт, возвращаемый вместе со своими операциями, уже несёт остаток с ними:
    // провести операции по нему ещё раз значило бы удвоить деньги.
    const accountsBack = new Set<string>();
    for (const entry of entries) {
      const { updatedAt: _stamp, ...row } = entry.row;
      void _stamp;
      try {
        if (entry.collection === "transactions") {
          const accountId = (row.account as { id?: unknown } | undefined)?.id;
          if (typeof accountId === "string" && accountsBack.has(accountId)) {
            if (!state.transactions.some((item) => item.id === row.id))
              state.transactions = [
                transactionRowSchema.omit({ updatedAt: true }).parse(row) as TransactionRow,
                ...state.transactions
              ];
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
            if (entry.collection === "accounts" && typeof row.id === "string")
              accountsBack.add(row.id);
          }
        }
        restored.push(entry.id);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }
    await this.save(state);
    const key = await this.trashKey();
    const left = readTrash(await this.storage.getItem<unknown>(key)).filter(
      (entry) => !restored.includes(entry.id)
    );
    await this.storage.setItem(key, { v: 1, entries: left });
    return { restored: restored.length, failed };
  }

  private async purgeTrash(ids: string[] | "all") {
    const key = await this.trashKey();
    const entries = readTrash(await this.storage.getItem<unknown>(key));
    const left = ids === "all" ? [] : entries.filter((entry) => !ids.includes(entry.id));
    await this.storage.setItem(key, { v: 1, entries: left });
    return { removed: entries.length - left.length };
  }

  // ——— фото чеков ————————————————————————————————————————————————

  private async readPhoto(state: LocalState, transactionId: string) {
    const row = state.transactions.find((item) => item.id === transactionId);
    if (!row?.photo) return { photo: null, place: null, missing: false };
    const stored = await this.storage.getItem<StoredPhoto>(photoKey(transactionId, row.photo));
    return isPhotoData(stored)
      ? { photo: stored.data, place: row.photo, missing: false }
      : // Отметка есть, а фото нет: его сняли «только на этом устройстве» на
        // другом, или оно ещё едет с сервера.
        { photo: null, place: row.photo, missing: true };
  }

  private async attachPhoto(state: LocalState, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const transactionId = String(input.transactionId ?? "");
    const row = state.transactions.find((item) => item.id === transactionId);
    if (!row) throw new Error("Операция не найдена — возможно, её уже удалили.");
    const data = String(input.data ?? "");
    if (!data.startsWith("data:image/") || data.length > PHOTO_MAX_CHARS)
      throw new Error("Не получилось прочитать фото. Попробуйте снять ещё раз.");
    const place: PhotoPlace = input.place === "device" ? "device" : "synced";
    // Было фото в другом месте — убрать, чтобы не лежало два.
    if (row.photo && row.photo !== place) await this.dropPhoto(transactionId, row.photo);
    const stored: StoredPhoto = {
      data,
      width: Number(input.width) || 0,
      height: Number(input.height) || 0,
      createdAt: new Date().toISOString()
    };
    await this.storage.setItem(photoKey(transactionId, place), stored);
    state.transactions = state.transactions.map((item) =>
      item.id === transactionId ? { ...item, photo: place } : item
    );
    return this.saveAndReturn(state, { transactionId, place });
  }

  /**
   * Убрать фото. Синхронизируемое — следом «удалено», а не стиранием: стёртое
   * здесь осталось бы на сервере и на других устройствах (слой синхронизации
   * нарочно не передаёт удаление ключа, см. SyncingStorageAdapter.removeItem).
   */
  private async dropPhoto(transactionId: string, place: PhotoPlace) {
    const key = photoKey(transactionId, place);
    try {
      if (place === "device") await this.storage.removeItem(key);
      else if (await this.storage.getItem<unknown>(key))
        await this.storage.setItem<StoredPhoto>(key, {
          removed: true,
          at: new Date().toISOString()
        });
    } catch {
      /* фото не главное — книга уже записана */
    }
  }

  /**
   * Книга, какой она лежит сейчас, — чтобы было с чем сличать. Почти всегда это
   * уже прогретая память (её наполняет любое чтение перед записью); обращение к
   * хранилищу остаётся на тот случай, когда запись идёт первой.
   */
  private async storedState(key: string): Promise<Record<string, unknown> | null> {
    if (this.stateCache?.key === key) return this.stateCache.state as Record<string, unknown>;
    const stored = await this.storage.getItem<Record<string, unknown>>(key);
    return stored && typeof stored === "object" ? stored : null;
  }

  private async getActiveProfileId(): Promise<string> {
    const list = await this.profileList();
    return list.activeProfileId;
  }

  private async profileList(): Promise<ProfileList> {
    const stored = await this.storage.getItem<ProfileList>(PROFILE_LIST_KEY);
    if (stored && Array.isArray(stored.profiles) && stored.profiles.length > 0) return stored;

    // Migration: check for legacy state
    const legacy = await this.storage.getItem<unknown>(LEGACY_STATE_KEY);
    const defaultProfile: UserProfile = {
      id: "profile-default",
      name: "Основной",
      color: "#0d9488",
      createdAt: new Date().toISOString()
    };
    const list: ProfileList = { profiles: [defaultProfile], activeProfileId: defaultProfile.id };

    if (legacy) {
      const parsed = localStateSchema.safeParse(legacy);
      await this.storage.setItem(
        profileStateKey(defaultProfile.id),
        parsed.success ? migrateLocalState(parsed.data) : legacy
      );
      await this.storage.removeItem(LEGACY_STATE_KEY);
      this.invalidateStateCache();
    }

    await this.storage.setItem(PROFILE_LIST_KEY, list);
    return list;
  }

  private async createProfile(name: string, color: string): Promise<UserProfile> {
    const list = await this.profileList();
    const profile: UserProfile = {
      id: id("profile"),
      name: name.trim().slice(0, 40) || "Новый профиль",
      color,
      createdAt: new Date().toISOString()
    };
    list.profiles.push(profile);
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    await this.storage.setItem(profileStateKey(profile.id), createInitialState());
    return profile;
  }

  private async renameProfile(profileId: string, name: string): Promise<void> {
    const list = await this.profileList();
    const profile = list.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    profile.name = name.trim().slice(0, 40) || profile.name;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
  }

  private async switchProfile(profileId: string): Promise<void> {
    const list = await this.profileList();
    if (!list.profiles.find((p) => p.id === profileId)) throw new Error("Profile not found");
    list.activeProfileId = profileId;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    this.invalidateStateCache();
  }

  /**
   * «Очистить все данные» — ПРАВКА данных, а не стирание файлов.
   *
   * Раньше здесь стоял `storage.clear()`, и при подключённой службе кнопка
   * врала. Очистка хранилища убирает книгу с диска и забывает номер версии —
   * а слой синхронизации нарочно не трогает сервер. Первый же обмен шёл от
   * версии ноль, получал «вас обогнали» и сливал пустое с полным без общей
   * основы, то есть возвращал всё обратно. Человек видел пустой экран, а через
   * секунду — свои данные. На экране при этом было написано «необратимо».
   *
   * Теперь пустота записывается ПОВЕРХ текущего, как любая другая правка. Она
   * уезжает на службу с верным номером версии, и другие устройства получают
   * её как удаление строк, а не как «у нас ещё не добавили».
   *
   * Тетрадки, кроме основной, тоже записываются пустыми, а не убираются:
   * убрать ключ значит снова «убрать с устройства, но не со службы», и на
   * службе осталась бы полная копия каждой.
   */
  private async clearEverything(): Promise<void> {
    const list = await this.profileList();
    const ids = new Set([...list.profiles.map((profile) => profile.id), DEFAULT_PROFILE.id]);

    // Сначала — копия всего, что сейчас есть: «Очистить все данные» нажимают и
    // по ошибке, а резервную копию в файл делают не все. Неделю её можно
    // вернуть одной кнопкой в настройках; на службу она не ездит.
    const states: Record<string, unknown> = {};
    for (const id of ids) {
      const existing = await this.storage.getItem<unknown>(profileStateKey(id));
      if (existing) states[id] = existing;
    }
    await this.storage.setItem<BeforeClearStored>(BEFORE_CLEAR_KEY, {
      savedAt: new Date().toISOString(),
      list,
      states
    });

    for (const id of ids) {
      const key = profileStateKey(id);
      const existing = await this.storage.getItem<unknown>(key);
      await this.storage.setItem(key, createBlankState(standardCategoriesFrom(existing)));
    }
    await this.storage.setItem(PROFILE_LIST_KEY, {
      profiles: [DEFAULT_PROFILE],
      activeProfileId: DEFAULT_PROFILE.id
    } satisfies ProfileList);

    // Местные копии — отложенные перед обновлением схемы и при поломке. Каждая
    // держит книгу ЦЕЛИКОМ, и «удалить всё», оставив их, значило бы удалить
    // не всё. На службу они не ездят, так что убрать их с диска и есть удалить.
    for (const key of await this.storage.keys()) {
      // Фото чеков — тоже данные человека. Синхронизируемые гасятся следом,
      // чтобы исчезли и на других устройствах.
      if (key.startsWith(PHOTO_PREFIX)) {
        const [, rest] = key.split(PHOTO_PREFIX);
        const place: PhotoPlace = rest.endsWith(":device") ? "device" : "synced";
        await this.dropPhoto(rest.replace(/:device$/, ""), place);
        continue;
      }
      if (
        key === LEGACY_STATE_KEY ||
        key.endsWith(PRE_UPGRADE_SUFFIX) ||
        key.endsWith(RESCUE_SUFFIX) ||
        // Ежедневные копии — тоже данные целиком. Отменить очистку можно и
        // без них: для этого откладывается своя копия, выше.
        key.endsWith(LOCAL_COPY_SUFFIX) ||
        key.endsWith(TRASH_SUFFIX)
      ) {
        await this.storage.removeItem(key);
      }
    }
    this.invalidateStateCache();
  }

  /** Копия до очистки, если она есть и ей не больше недели. */
  private async beforeClearCopy(): Promise<BeforeClearCopy | null> {
    const stored = await this.storage.getItem<BeforeClearStored>(BEFORE_CLEAR_KEY);
    if (!stored?.savedAt) return null;
    const until = new Date(Date.parse(stored.savedAt) + BEFORE_CLEAR_DAYS * 24 * 60 * 60 * 1000);
    if (until.getTime() < Date.now()) {
      await this.storage.removeItem(BEFORE_CLEAR_KEY);
      return null;
    }
    return { savedAt: stored.savedAt, until: until.toISOString() };
  }

  /**
   * «Вернуть» — всё, как было до очистки. Каждая тетрадка записывается как
   * правка поверх пустой: так возвращённое уезжает на другие устройства тем
   * же путём, каким туда уехала очистка.
   */
  private async undoClear(): Promise<void> {
    if (!(await this.beforeClearCopy())) {
      throw new Error("Копии до очистки нет: её хранят неделю.");
    }
    const stored = (await this.storage.getItem<BeforeClearStored>(BEFORE_CLEAR_KEY))!;
    for (const [profileId, raw] of Object.entries(stored.states)) {
      const parsed = localStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      await this.storage.setItem(PROFILE_LIST_KEY, {
        ...stored.list,
        activeProfileId: profileId
      } satisfies ProfileList);
      this.invalidateStateCache();
      await this.save(migrateLocalState(parsed.data), { stamp: false });
    }
    await this.storage.setItem(PROFILE_LIST_KEY, stored.list);
    await this.storage.removeItem(BEFORE_CLEAR_KEY);
    this.invalidateStateCache();
  }

  /** Копии на этом устройстве, свежие первыми. */
  private async localCopies(): Promise<LocalCopy[]> {
    const index = await this.storage.getItem<LocalCopy[]>(LOCAL_COPY_INDEX_KEY);
    return Array.isArray(index)
      ? [...index].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      : [];
  }

  /**
   * Отложить копию всего, что сейчас есть, — все тетрадки целиком.
   *
   * Перечень хранится отдельно от самих копий: чтобы показать список, не надо
   * открывать четырнадцать полных копий книги.
   */
  private async takeLocalCopy(reason: LocalCopy["reason"]): Promise<LocalCopy> {
    const list = await this.profileList();
    const ids = new Set([...list.profiles.map((profile) => profile.id), DEFAULT_PROFILE.id]);
    const states: Record<string, unknown> = {};
    let operations = 0;
    for (const id of ids) {
      const existing = await this.storage.getItem<unknown>(profileStateKey(id));
      if (!existing) continue;
      states[id] = existing;
      const rows = (existing as { transactions?: unknown }).transactions;
      if (Array.isArray(rows)) operations += rows.length;
    }

    const now = new Date();
    const copy: LocalCopy = {
      id: `${now.getTime()}`,
      savedAt: now.toISOString(),
      reason,
      operations
    };
    await this.storage.setItem<LocalCopyStored>(localCopyKey(copy.id), {
      savedAt: copy.savedAt,
      list,
      states
    });

    const kept = [copy, ...(await this.localCopies())];
    for (const stale of kept.slice(LOCAL_COPIES_KEEP)) {
      await this.storage.removeItem(localCopyKey(stale.id));
    }
    await this.storage.setItem(LOCAL_COPY_INDEX_KEY, kept.slice(0, LOCAL_COPIES_KEEP));
    return copy;
  }

  /** Раз в день: если сегодня копии ещё не было — сделать. */
  private async dailyLocalCopy(): Promise<LocalCopy | null> {
    const today = todayDay();
    const copies = await this.localCopies();
    if (
      copies.some((copy) => copy.reason === "daily" && todayDay(new Date(copy.savedAt)) === today)
    ) {
      return null;
    }
    return this.takeLocalCopy("daily");
  }

  /**
   * «Вернуть» копию — тем же путём, что и возврат после очистки: каждая
   * тетрадка записывается как обычная правка и уезжает на другие устройства.
   * Нынешнее перед этим откладывается ещё одной копией — передумать можно.
   */
  private async restoreLocalCopy(id: string): Promise<void> {
    const stored = await this.storage.getItem<LocalCopyStored>(localCopyKey(id));
    if (!stored?.states) throw new Error("Такой копии на этом устройстве нет.");
    await this.takeLocalCopy("before-restore");
    for (const [profileId, raw] of Object.entries(stored.states)) {
      const parsed = localStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      await this.storage.setItem(PROFILE_LIST_KEY, {
        ...stored.list,
        activeProfileId: profileId
      } satisfies ProfileList);
      this.invalidateStateCache();
      // С новой отметкой: возвращённое — это правка, сделанная сейчас, и на
      // других устройствах она обязана перевесить то, что было после копии.
      await this.save(migrateLocalState(parsed.data));
    }
    await this.storage.setItem(PROFILE_LIST_KEY, stored.list);
    this.invalidateStateCache();
  }

  /** Завести профиль «Пример» (или взять прежний) и сделать его текущим. */
  private async openSampleProfile(): Promise<void> {
    const list = await this.profileList();
    if (!list.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)) {
      list.profiles.push({
        id: SAMPLE_PROFILE_ID,
        name: "Пример",
        color: "#a855f7",
        createdAt: new Date().toISOString()
      });
    }
    if (list.activeProfileId !== SAMPLE_PROFILE_ID) list.returnTo = list.activeProfileId;
    list.activeProfileId = SAMPLE_PROFILE_ID;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    this.invalidateStateCache();
  }

  /** Вернуться из примера к своим данным; по желанию — убрать пример совсем. */
  private async leaveSampleProfile(remove: boolean): Promise<void> {
    const list = await this.profileList();
    const back =
      list.profiles.find((p) => p.id === list.returnTo && p.id !== SAMPLE_PROFILE_ID) ??
      list.profiles.find((p) => p.id !== SAMPLE_PROFILE_ID);
    if (!back) {
      // Кроме примера профилей нет — заводим основной, пустой.
      await this.createProfile("Основной", "#0d9488");
      return this.leaveSampleProfile(remove);
    }
    list.activeProfileId = back.id;
    delete list.returnTo;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    this.invalidateStateCache();
    if (remove && list.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)) {
      await this.deleteProfile(SAMPLE_PROFILE_ID);
    }
  }

  private async deleteProfile(profileId: string): Promise<void> {
    const list = await this.profileList();
    if (list.profiles.length <= 1) throw new Error("Нельзя удалить последний профиль");
    list.profiles = list.profiles.filter((p) => p.id !== profileId);
    if (list.activeProfileId === profileId) list.activeProfileId = list.profiles[0].id;
    await this.storage.setItem(PROFILE_LIST_KEY, list);
    await this.storage.removeItem(profileStateKey(profileId));
    this.invalidateStateCache();
  }
}
