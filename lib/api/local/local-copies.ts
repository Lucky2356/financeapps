// Копии на этом устройстве, которые не уезжают на службу: копия до перевода
// книги на новую схему и при поломке, копия до «Очистить все данные» (и сама
// очистка), ежедневные и ручные местные копии с их ротацией, а также уборка
// отложенных фото, которым уже некуда вернуться.
// Вынесено из LocalApiClient; зовётся через StoreContext.

import { readableState } from "@/lib/api/local/backup-restore";
import { dropPhoto } from "@/lib/api/local/photo-store";
import {
  DEFAULT_PROFILE,
  getActiveProfileId,
  LEGACY_STATE_KEY,
  PROFILE_LIST_KEY,
  profileList,
  profileStateKey
} from "@/lib/api/local/profiles";
import { createBlankState, migrateLocalState, standardCategoriesFrom } from "@/lib/api/local/state";
import type { StoreContext } from "@/lib/api/local/store-context";
import { apiText } from "@/lib/i18n/api-text";
import { dataText } from "@/lib/i18n/data-text";
import { KEPT_PHOTO_PREFIX, keptPhotoStale } from "@/lib/photos/kept-photos";
import { PHOTO_PREFIX, type PhotoPlace } from "@/lib/photos/receipt-photo";
import {
  BEFORE_CLEAR_SUFFIX,
  LOCAL_COPY_SUFFIX,
  PRE_UPGRADE_SUFFIX,
  RESCUE_SUFFIX,
  TRASH_SUFFIX
} from "@/lib/storage/SyncingStorageAdapter";
import { todayDay } from "@/lib/transactions/date";
import type { ProfileList } from "@/types/profiles";

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

/**
 * Книга, какой она была до перевода на новую схему, — или ничего, если
 * переводов ещё не было.
 *
 * Отдаётся в том же виде, что и обычная выгрузка, и это главное: в ней лежит
 * СТАРАЯ схема, и прежняя версия приложения примет такой файл своим обычным
 * «восстановить из копии». Ради этой одной возможности копия и держится.
 */
export async function preUpgradeBackup(ctx: StoreContext): Promise<PreUpgradeBackup | null> {
  const profileId = await getActiveProfileId(ctx);
  const stored = await ctx.storage.getItem<unknown>(
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

/**
 * Puts the unreadable document aside before anything else touches the key.
 * Written once: a second failure must not overwrite the first rescue, which
 * is the one closest to the moment things went wrong.
 */
export async function keepRescueCopy(ctx: StoreContext, key: string, document: unknown) {
  const rescueKey = `${key}${RESCUE_SUFFIX}`;
  try {
    if ((await ctx.storage.getItem<unknown>(rescueKey)) == null)
      await ctx.storage.setItem(rescueKey, document);
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
export async function keepPreUpgradeCopy(
  ctx: StoreContext,
  key: string,
  document: unknown,
  fromVersion: number,
  toVersion: number
) {
  try {
    await ctx.storage.setItem(`${key}${PRE_UPGRADE_SUFFIX}`, {
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
export async function clearEverything(ctx: StoreContext): Promise<void> {
  const list = await profileList(ctx);
  const ids = new Set([...list.profiles.map((profile) => profile.id), DEFAULT_PROFILE.id]);

  // Сначала — копия всего, что сейчас есть: «Очистить все данные» нажимают и
  // по ошибке, а резервную копию в файл делают не все. Неделю её можно
  // вернуть одной кнопкой в настройках; на службу она не ездит.
  const states: Record<string, unknown> = {};
  for (const id of ids) {
    const existing = await ctx.storage.getItem<unknown>(profileStateKey(id));
    if (existing) states[id] = existing;
  }
  await ctx.storage.setItem<BeforeClearStored>(BEFORE_CLEAR_KEY, {
    savedAt: new Date().toISOString(),
    list,
    states
  });

  for (const id of ids) {
    const key = profileStateKey(id);
    const existing = await ctx.storage.getItem<unknown>(key);
    await ctx.storage.setItem(key, createBlankState(standardCategoriesFrom(existing)));
  }
  // Книги профилей, которых в списке уже нет. Так выглядит профиль, удалённый
  // прежней версией: та убирала его только с устройства, служба держала
  // полную копию и привозила её обратно при сверке. По списку профилей её не
  // найти, а «удалить всё» обязано удалить и её — пустотой поверх, чтобы
  // исчезла и на службе. В копию до очистки она не идёт: возвращать профиль,
  // который человек уже удалял, незачем.
  const profilePrefix = profileStateKey("");
  for (const key of await ctx.storage.keys()) {
    if (!key.startsWith(profilePrefix) || key.includes(":")) continue;
    if (ids.has(key.slice(profilePrefix.length))) continue;
    await ctx.storage.setItem(key, createBlankState([]));
  }
  await ctx.storage.setItem(PROFILE_LIST_KEY, {
    profiles: [{ ...DEFAULT_PROFILE, name: dataText("data.profile.main") }],
    activeProfileId: DEFAULT_PROFILE.id
  } satisfies ProfileList);

  // Местные копии — отложенные перед обновлением схемы и при поломке. Каждая
  // держит книгу ЦЕЛИКОМ, и «удалить всё», оставив их, значило бы удалить
  // не всё. На службу они не ездят, так что убрать их с диска и есть удалить.
  for (const key of await ctx.storage.keys()) {
    if (
      key === LEGACY_STATE_KEY ||
      key.endsWith(PRE_UPGRADE_SUFFIX) ||
      key.endsWith(RESCUE_SUFFIX) ||
      // Ежедневные копии — тоже данные целиком. Отменить очистку можно и
      // без них: для этого откладывается своя копия, выше.
      key.endsWith(LOCAL_COPY_SUFFIX) ||
      key.endsWith(TRASH_SUFFIX)
    ) {
      // Отложенные фото (kept-photos.ts) тоже уходят: их операции
      // удалили ещё до очистки, а копии, которым они были нужны, — вот здесь.
      await ctx.storage.removeItem(key);
    }
  }
  // Фото чеков — тоже данные человека. Синхронизируемые гасятся следом,
  // чтобы исчезли и на других устройствах. Но сначала откладываются — на
  // тот же срок, что и копия до очистки: без них «Вернуть» возвращало
  // операции со скрепкой и без фото. Отдельным проходом, ПОСЛЕ уборки выше:
  // в одном проходе отложенное только что могло попасть под неё же.
  for (const key of await ctx.storage.keys()) {
    if (!key.startsWith(PHOTO_PREFIX)) continue;
    const [, rest] = key.split(PHOTO_PREFIX);
    const place: PhotoPlace = rest.endsWith(":device") ? "device" : "synced";
    await dropPhoto(ctx, rest.replace(/:device$/, ""), place, BEFORE_CLEAR_DAYS);
  }
  ctx.invalidateStateCache();
}

/** Копия до очистки, если она есть и ей не больше недели. */
export async function beforeClearCopy(ctx: StoreContext): Promise<BeforeClearCopy | null> {
  const stored = await ctx.storage.getItem<BeforeClearStored>(BEFORE_CLEAR_KEY);
  if (!stored?.savedAt) return null;
  const until = new Date(Date.parse(stored.savedAt) + BEFORE_CLEAR_DAYS * 24 * 60 * 60 * 1000);
  if (until.getTime() < Date.now()) {
    await ctx.storage.removeItem(BEFORE_CLEAR_KEY);
    return null;
  }
  return { savedAt: stored.savedAt, until: until.toISOString() };
}

/**
 * «Вернуть» — всё, как было до очистки. Каждая тетрадка записывается как
 * правка поверх пустой: так возвращённое уезжает на другие устройства тем
 * же путём, каким туда уехала очистка.
 */
export async function undoClear(ctx: StoreContext): Promise<void> {
  if (!(await beforeClearCopy(ctx))) {
    throw new Error(apiText("api.clear.noCopy"));
  }
  const stored = (await ctx.storage.getItem<BeforeClearStored>(BEFORE_CLEAR_KEY))!;
  // Раньше профиль, не прошедший строгую проверку, молча пропускался, копия
  // стиралась, а экран говорил «вернули». Одна кривая строка — и все
  // записи профиля пропадали насовсем. Теперь кривое отбрасывается, а
  // если профиль не читается вовсе, копия остаётся и об этом сказано.
  let unreadable = 0;
  for (const [profileId, raw] of Object.entries(stored.states)) {
    const readable = readableState(raw);
    if (!readable) {
      unreadable += 1;
      continue;
    }
    await ctx.storage.setItem(PROFILE_LIST_KEY, {
      ...stored.list,
      activeProfileId: profileId
    } satisfies ProfileList);
    ctx.invalidateStateCache();
    await ctx.save(migrateLocalState(readable), { stamp: false });
  }
  await ctx.storage.setItem(PROFILE_LIST_KEY, stored.list);
  ctx.invalidateStateCache();
  if (unreadable > 0) throw new Error(apiText("api.copy.partlyUnreadable"));
  await ctx.storage.removeItem(BEFORE_CLEAR_KEY);
}

/** Копии на этом устройстве, свежие первыми. */
export async function localCopies(ctx: StoreContext): Promise<LocalCopy[]> {
  const index = await ctx.storage.getItem<LocalCopy[]>(LOCAL_COPY_INDEX_KEY);
  return Array.isArray(index) ? [...index].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
}

/**
 * Отложить копию всего, что сейчас есть, — все тетрадки целиком.
 *
 * Перечень хранится отдельно от самих копий: чтобы показать список, не надо
 * открывать четырнадцать полных копий книги.
 */
export async function takeLocalCopy(
  ctx: StoreContext,
  reason: LocalCopy["reason"]
): Promise<LocalCopy> {
  const list = await profileList(ctx);
  const ids = new Set([...list.profiles.map((profile) => profile.id), DEFAULT_PROFILE.id]);
  const states: Record<string, unknown> = {};
  let operations = 0;
  for (const id of ids) {
    const existing = await ctx.storage.getItem<unknown>(profileStateKey(id));
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
  await ctx.storage.setItem<LocalCopyStored>(localCopyKey(copy.id), {
    savedAt: copy.savedAt,
    list,
    states
  });

  const kept = [copy, ...(await localCopies(ctx))];
  for (const stale of kept.slice(LOCAL_COPIES_KEEP)) {
    await ctx.storage.removeItem(localCopyKey(stale.id));
  }
  await ctx.storage.setItem(LOCAL_COPY_INDEX_KEY, kept.slice(0, LOCAL_COPIES_KEEP));
  // Ушли старые копии — с ними, может быть, и нужда в отложенных фото.
  if (kept.length > LOCAL_COPIES_KEEP) await pruneKeptPhotos(ctx);
  return copy;
}

/** Раз в день: если сегодня копии ещё не было — сделать. */
export async function dailyLocalCopy(ctx: StoreContext): Promise<LocalCopy | null> {
  const today = todayDay();
  const copies = await localCopies(ctx);
  if (
    copies.some((copy) => copy.reason === "daily" && todayDay(new Date(copy.savedAt)) === today)
  ) {
    return null;
  }
  return takeLocalCopy(ctx, "daily");
}

/**
 * «Вернуть» копию — тем же путём, что и возврат после очистки: каждая
 * тетрадка записывается как обычная правка и уезжает на другие устройства.
 * Нынешнее перед этим откладывается ещё одной копией — передумать можно.
 */
export async function restoreLocalCopy(ctx: StoreContext, id: string): Promise<void> {
  const stored = await ctx.storage.getItem<LocalCopyStored>(localCopyKey(id));
  if (!stored?.states) throw new Error(apiText("api.backup.noSuchCopy"));
  await takeLocalCopy(ctx, "before-restore");
  let unreadable = 0;
  for (const [profileId, raw] of Object.entries(stored.states)) {
    // Как и отмена очистки: кривое отбрасывается, а не весь профиль.
    const readable = readableState(raw);
    if (!readable) {
      unreadable += 1;
      continue;
    }
    await ctx.storage.setItem(PROFILE_LIST_KEY, {
      ...stored.list,
      activeProfileId: profileId
    } satisfies ProfileList);
    ctx.invalidateStateCache();
    // С новой отметкой: возвращённое — это правка, сделанная сейчас, и на
    // других устройствах она обязана перевесить то, что было после копии.
    await ctx.save(migrateLocalState(readable));
  }
  await ctx.storage.setItem(PROFILE_LIST_KEY, stored.list);
  ctx.invalidateStateCache();
  if (unreadable > 0) throw new Error(apiText("api.copy.partlyUnreadable"));
}

/**
 * Убрать отложенные фото, которые больше никому не вернуть: срок вышел, и
 * нет копии (местной или до очистки) старше, чем их отложили. Метёт там, где
 * отложенных прибавляется (удаление операций с фото) и где копии уходят
 * (takeLocalCopy), — не на каждую запись: читать приходится каждое фото.
 */
export async function pruneKeptPhotos(ctx: StoreContext) {
  try {
    const clearCopy = await beforeClearCopy(ctx);
    const oldest =
      [...(await localCopies(ctx)).map((copy) => copy.savedAt), clearCopy?.savedAt]
        .filter((at): at is string => typeof at === "string")
        .sort()[0] ?? null;
    const now = new Date().toISOString();
    for (const key of await ctx.storage.keys()) {
      if (!key.startsWith(KEPT_PHOTO_PREFIX)) continue;
      if (keptPhotoStale(await ctx.storage.getItem<unknown>(key), now, oldest))
        await ctx.storage.removeItem(key);
    }
  } catch {
    /* подметём в следующий раз */
  }
}
