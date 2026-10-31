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
  type WriteMarket,
  type WriteRequest
} from "@/lib/api/local/writes";
import { normalizePath, routeOf, toFormObject } from "@/lib/api/local/helpers";
import { freezeLedgerOutsideProduction } from "@/lib/api/freeze-state";
import { STAMPED, stampRows, trackDeletions } from "@/lib/sync/row-stamps";
import { localStateSchema, salvageLocalState } from "@/lib/api/local/schemas";
import { orphanedPhotos, type PhotoPlace } from "@/lib/photos/receipt-photo";
import { KEPT_PHOTO_DAYS } from "@/lib/photos/kept-photos";
import { createStorageAdapter } from "@/lib/storage/createStorageAdapter";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import type { StorageAdapter } from "@/lib/storage/StorageAdapter";
import { vanishedRows } from "@/lib/trash/trash";
import { type LocalState, createInitialState, migrateLocalState } from "@/lib/api/local/state";
import { buildSampleState } from "@/lib/api/local/sample";
import { dataText } from "@/lib/i18n/data-text";
import { apiText } from "@/lib/i18n/api-text";
import type { SaveOptions, StoreContext } from "@/lib/api/local/store-context";
import { assertStorable, writableCopy } from "@/lib/api/local/book-write";
import {
  createProfile,
  deleteProfile,
  getActiveProfileId,
  leaveSampleProfile,
  openSampleProfile,
  profileList,
  profileStateKey,
  renameProfile,
  switchProfile
} from "@/lib/api/local/profiles";
import { attachPhoto, dropPhoto, readPhoto, returnKeptPhotos } from "@/lib/api/local/photo-store";
import {
  purgeTrash,
  putInTrash,
  restoreFromTrash,
  trashIds,
  trashList
} from "@/lib/api/local/trash-store";
import {
  beforeClearCopy,
  clearEverything,
  dailyLocalCopy,
  keepPreUpgradeCopy,
  keepRescueCopy,
  localCopies,
  preUpgradeBackup,
  pruneKeptPhotos,
  restoreLocalCopy,
  takeLocalCopy,
  undoClear
} from "@/lib/api/local/local-copies";
import {
  exportAllProfiles,
  exportBackup,
  mergeBackup,
  restoreBackup
} from "@/lib/api/local/backup-restore";
import { refreshInvestments } from "@/lib/api/local/investments-refresh";

// Прежде жили здесь — потребители импортируют их отсюда.
export {
  STANDARD_CATEGORY_IDS,
  spendingPlan,
  OPENING_BALANCE_ID,
  SAVINGS_BALANCE_ID,
  SAVINGS_TRANSFER_ID
} from "@/lib/api/local/state";
export type { BackupDocument, ProfilesBackup } from "@/lib/api/local/backup-restore";
export {
  LOCAL_COPIES_KEEP,
  type BeforeClearCopy,
  type LocalCopy,
  type PreUpgradeBackup
} from "@/lib/api/local/local-copies";

export class LocalApiClient implements ApiClient {
  constructor(private readonly storage: StorageAdapter = createStorageAdapter()) {
    this.ctx = {
      storage,
      state: (mutable) => this.state(mutable),
      save: (state, options) => this.save(state, options),
      invalidateStateCache: () => this.invalidateStateCache(),
      serialize: (operation) => this.serialize(operation)
    };
  }

  /**
   * Что получают модули хранилища в lib/api/local/* (профили, копии, корзина,
   * фото, восстановление): само хранилище и книгу — через кэш, очередь и
   * единственную точку сохранения этого клиента (store-context.ts).
   */
  private readonly ctx: StoreContext;

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
    "/backup/before-upgrade": () => preUpgradeBackup(this.ctx),
    "/backup/before-clear": () => beforeClearCopy(this.ctx),
    "/backup/local-copies": () => localCopies(this.ctx),
    "/backup/profiles": () => exportAllProfiles(this.ctx),
    "/trash": () => trashList(this.ctx),
    "/profiles": () => profileList(this.ctx),
    "/photos": ({ state, searchParams }: ReadRequest) =>
      readPhoto(this.ctx, state, searchParams.get("id") ?? ""),
    "/backup": ({ state }: ReadRequest) => exportBackup(this.ctx, state),
    "/investments": ({ state }: ReadRequest) => refreshInvestments(this.ctx, state)
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
   * Запись, которой нужна биржа (PRICED_WRITES: цены, справочник, история),
   * сначала получает её ответ — ДО очереди, а не в ней: биржу ждут секундами,
   * и всё это время очередь стояла бы. Документ для этого читается без
   * очереди, как при любом чтении: он нужен только затем, чтобы знать, что
   * спрашивать. Портфель могут успеть поменять, пока ждём биржу, — обработчик
   * считает по документу, прочитанному уже в очереди, а бумага без
   * полученной цены идёт по своей последней.
   */
  private enqueueWrite<TResponse>(
    path: string,
    body: unknown,
    method: "POST" | "PUT"
  ): Promise<TResponse> {
    const askMarket = routeOf(PRICED_WRITES, normalizePath(path).pathname);
    if (!askMarket) return this.serialize(() => this.write<TResponse>(path, body, method));
    return this.state(false)
      .then((state) => askMarket(state, body))
      .then((market) => this.serialize(() => this.write<TResponse>(path, body, method, market)));
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
      if (row?.photo) await dropPhoto(this.ctx, itemId, row.photo);
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
      await deleteProfile(this.ctx, itemId);
      return true;
    },
    "/storage/clear": async () => {
      await clearEverything(this.ctx);
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
      await openSampleProfile(this.ctx);
      const sample = buildSampleState();
      await this.save(sample, { trash: false });
      return { loaded: true };
    },
    "/sample/leave": async ({ body }: WriteRequest) => {
      await leaveSampleProfile(this.ctx, toFormObject(body).remove === "true");
      return undefined;
    },
    "/sync/resolve": ({ state, body }: WriteRequest) => this.resolveConflict(state, body),
    "/backup": ({ body }: WriteRequest) => restoreBackup(this.ctx, body),
    "/backup/before-clear": async () => {
      await undoClear(this.ctx);
      return { restored: true };
    },
    "/backup/local-copies": byAction(
      {
        restore: async ({ body }: WriteRequest) => {
          await restoreLocalCopy(this.ctx, String((body as { id?: unknown } | null)?.id ?? ""));
          return { restored: true };
        },
        daily: () => dailyLocalCopy(this.ctx)
      },
      () => takeLocalCopy(this.ctx, "manual")
    ),
    "/backup/merge": ({ body }: WriteRequest) => mergeBackup(this.ctx, body),
    "/trash": byAction(
      {
        restore: ({ state, body }: WriteRequest) =>
          restoreFromTrash(this.ctx, state, trashIds(body)),
        empty: () => purgeTrash(this.ctx, "all")
      },
      ({ body }: WriteRequest) => purgeTrash(this.ctx, trashIds(body))
    ),
    "/photos": ({ state, body }: WriteRequest) => attachPhoto(this.ctx, state, body),
    "/profiles/create": ({ body }: WriteRequest) => {
      const input = toFormObject(body);
      return createProfile(
        this.ctx,
        input.name ?? dataText("data.profile.default"),
        input.color ?? "#0d9488"
      );
    },
    "/profiles/switch": async ({ body }: WriteRequest) => {
      await switchProfile(this.ctx, toFormObject(body).profileId ?? "");
      return undefined;
    },
    "/profiles/rename": async ({ body }: WriteRequest) => {
      const input = toFormObject(body);
      await renameProfile(this.ctx, input.profileId ?? "", input.name ?? "");
      return undefined;
    }
  };

  private async write<TResponse>(
    path: string,
    body: unknown,
    method: "POST" | "PUT",
    market: WriteMarket = {}
  ): Promise<TResponse> {
    const state = await this.state();
    const { pathname } = normalizePath(path);
    const request: WriteRequest = { state, body, method, ...market };

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

  /**
   * The active profile's document. `mutable` (the default) hands back a copy,
   * so a handler that changes things — and may still throw — cannot poison the
   * cache; reads pass `false` and get the cached object itself, which is what
   * keeps a big ledger quick.
   */
  private async state(mutable = true) {
    const profileId = await getActiveProfileId(this.ctx);
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
        await keepPreUpgradeCopy(
          this.ctx,
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
        await putInTrash(
          this.ctx,
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
      throw new Error(apiText("api.data.newerVersion", { version: storedVersion }));

    await keepRescueCopy(this.ctx, key, existing);

    const salvaged = salvageLocalState(existing);
    if (!salvaged) throw new Error(apiText("api.data.unreadable"));

    const migrated = migrateLocalState(salvaged.state);
    await this.storage.setItem(key, migrated);
    this.stateCache = { key, state: freezeLedgerOutsideProduction(structuredClone(migrated)) };
    return structuredClone(migrated);
  }

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
    if (!identify) throw new Error(apiText("api.data.noCollection", { name: collection }));

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
  private async save(state: LocalState, options: SaveOptions = {}) {
    const profileId = await getActiveProfileId(this.ctx);
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
    assertStorable(next, options.stamp === false ? null : now);
    await this.storage.setItem(key, next);
    // Без копии: следующая запись всё равно начнёт с writableCopy, а чтения
    // книгу не трогают (см. freeze-state.ts — вне поставки она заморожена).
    this.stateCache = { key, state: freezeLedgerOutsideProduction(next) };
    // Удалённое — в корзину. Сличаем записанное с прежним, как и для фото ниже:
    // мест, где что-то удаляют, слишком много, чтобы ловить каждое.
    // Загрузка примера переписывает книгу целиком — это не удаление.
    if (options.trash !== false) {
      await putInTrash(
        this.ctx,
        key,
        vanishedRows(previous, next as unknown as Record<string, unknown>),
        "here"
      );
    }
    // Операции не стало — не стало и её фото. Сличаем записанное с прежним,
    // а не ловим каждое место, где операцию удаляют: их много (одна, чек
    // целиком, выбранные, перевод), и одно забытое оставило бы фото навсегда.
    //
    // Фото при этом не стирается, а откладывается (kept-photos.ts): операция
    // пропадает и тогда, когда книгу заменяют копией, — и возвращается, когда
    // возвращают другую. Вернулась — фото кладётся обратно (returnKeptPhotos).
    const before =
      (previous?.transactions as Array<{ id: string; photo?: PhotoPlace }> | undefined) ?? [];
    const gone = orphanedPhotos(before, next.transactions);
    for (const photo of gone) await dropPhoto(this.ctx, photo.id, photo.place, KEPT_PHOTO_DAYS);
    if (gone.length > 0) await pruneKeptPhotos(this.ctx);
    await returnKeptPhotos(this.ctx, before, next.transactions);
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
}
