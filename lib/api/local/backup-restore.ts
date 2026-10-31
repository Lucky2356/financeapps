// Копия в файл и обратно: выгрузка (`/backup`, `/backup/profiles`),
// восстановление (`POST /backup`) и «Объединить» (`/backup/merge`), а также
// чтение книги из копии — строго или спасением по частям.
// Вынесено из LocalApiClient; зовётся через StoreContext. Сама склейка строк
// при объединении — в merge-records.ts.

import { id } from "@/lib/api/local/helpers";
import { mergeRecords, sameName } from "@/lib/api/local/merge-records";
import {
  DEFAULT_PROFILE,
  getActiveProfileId,
  PROFILE_LIST_KEY,
  profileList,
  profileStateKey
} from "@/lib/api/local/profiles";
import { localStateSchema, salvageLocalState } from "@/lib/api/local/schemas";
import { backupDocument } from "@/lib/api/local/settings";
import { type LocalState, migrateLocalState } from "@/lib/api/local/state";
import type { StoreContext } from "@/lib/api/local/store-context";
import { apiText } from "@/lib/i18n/api-text";
import { dataText } from "@/lib/i18n/data-text";
import { LATEST_LOCAL_STATE_VERSION } from "@/lib/storage/migrations/runLocalStateMigrations";
import { STAMPED } from "@/lib/sync/row-stamps";
import type { ProfileList, UserProfile } from "@/types/profiles";

/** Книга одного профиля в том виде, в каком её отдаёт `/backup`. */
export type BackupDocument = Awaited<ReturnType<typeof backupDocument>>;

/**
 * Все профили устройства разом — что отдаёт `/backup/profiles` и что
 * принимает `/backup/merge` наравне с книгой одного профиля.
 *
 * Нужно «Объединить» при подключении. Раньше оно брало обычный `/backup`, а тот
 * выгружает только ТЕКУЩИЙ профиль. Остальные стирались очисткой и пропадали
 * насовсем: копия перед очисткой не переживает подключения — новый ключ
 * сносит всё, что запечатано прежним (EncryptingStorageAdapter.clear). Профиль
 * «Бизнес» со своим «Бизнес-счётом» после «Объединить» исчезал без следа.
 *
 * Текущий профиль — первым. Пример тоже едет: в нём, бывает, ведут и свои
 * записи, и выбрасывать их молча нельзя.
 */
export type ProfilesBackup = {
  format: "profiles";
  savedAt: string;
  activeProfileId: string;
  profiles: Array<{ profile: UserProfile; backup: BackupDocument }>;
};

/**
 * The exported file records when it was made, so the stamp goes into the
 * payload here — and into storage inside the queue, on a state read again,
 * so an export cannot roll back whatever was saved meanwhile.
 */
export async function exportBackup(ctx: StoreContext, state: LocalState) {
  const stamped = new Date().toISOString();
  const payload = await backupDocument({ ...state, lastBackupAt: stamped });
  await ctx.serialize(async () => {
    const fresh = await ctx.state();
    fresh.lastBackupAt = stamped;
    await ctx.save(fresh);
  });
  return payload;
}

export async function restoreBackup(ctx: StoreContext, body: unknown) {
  const payload = (body as { backup?: unknown })?.backup;
  // Scheduled backups and folder sync write the document inside an envelope
  // (`{ exportedAt, backup }`); the button writes it bare. Accept either, so
  // any file the app itself produced can be restored.
  const document =
    payload && typeof payload === "object" && "backup" in payload
      ? (payload as { backup?: unknown }).backup
      : payload;
  // Своя же выгрузка с одной кривой строкой (длинная метка, лимит старой
  // версии) отвергалась целиком — «файл не похож на копию». Читается так
  // же, как своя книга при запуске: кривое отбрасывается, остальное — на месте.
  assertNotNewer(document);
  const readable = readableState(document);
  if (!readable) throw new Error(apiText("api.backup.notBackup"));
  const restored = migrateLocalState(readable);

  // The key does not travel in the file (see `backup`), so a copy carries an
  // empty one. Writing that over the key set on THIS machine would quietly
  // switch the AI features off on every restore, and the owner would go
  // looking for the fault in the wrong place. The machine keeps its own.
  const current = await ctx.state();
  if (!restored.aiApiKey) restored.aiApiKey = current.aiApiKey ?? "";

  // С новой отметкой, как и «Вернуть» местную копию (restoreLocalCopy):
  // восстановление — это правка, сделанная СЕЙЧАС. С отметками из файла
  // возвращённая операция «обед» оставалась старше следа своего удаления на
  // компьютере, и первая же синхронизация удаляла её снова — а счёт при этом
  // оставался с остатком из копии: 4900 при пустом списке операций вместо
  // 5000. Отметку получают только строки, которые восстановление и правда
  // меняет; совпавшие с нынешними сохраняют свою, так что старая книга
  // целиком «свежей» не становится.
  await ctx.save(restored);
  return { restored: true };
}

/**
 * Добавить к текущим данным записи из копии — «Объединить» при подключении.
 *
 * Устройство со своими записями подключается к другому: ключ и данные
 * приезжают оттуда, а свои записи, снятые копией до подключения, ложатся
 * сюда ДОБАВКОЙ. Ничего из уже лежащего здесь не заменяется (как именно —
 * см. mergeRecords в merge-records.ts).
 *
 * Копия бывает двух видов: книга одного профиля (обычный `/backup`) и все
 * профили разом (`/backup/profiles`, ProfilesBackup). Вторую шлёт «Объединить»
 * — иначе профили, кроме текущего, терялись.
 */
export async function mergeBackup(ctx: StoreContext, body: unknown) {
  const payload = (body as { backup?: unknown })?.backup;
  const document =
    payload && typeof payload === "object" && "backup" in payload
      ? (payload as { backup?: unknown }).backup
      : payload;
  if (isProfilesBackup(document)) return mergeProfiles(ctx, document);

  const incoming = readMergeDocument(document);
  const state = await ctx.state();
  const added = mergeRecords(state, incoming);
  await ctx.save(state);
  return { merged: added };
}

/**
 * Все профили копии — по своим местам.
 *
 * Каждый профиль копии ищет себе пару среди здешних — по id (так совпадают
 * «Основной» двух устройств и профили, уже приехавшие прошлым объединением),
 * затем по имени. Нашёлся — записи добавляются к нему; нет — профиль
 * заводится заново, с тем же id, именем и цветом.
 *
 * Открытый профиль копии — так же, как остальные. Прежде он ложился в
 * открытый профиль здесь, какой бы тот ни был: открыт на ноутбуке «Бизнес»
 * или «Пример» — и при подключении его счета и операции вливались в общий
 * «Основной» и разъезжались по всем устройствам семьи, а сам профиль
 * пропадал. «Основной» в «Основной» попадает и так — по общему id.
 *
 * Сначала читается ВСЁ, и только потом пишется: копия, у которой третий
 * профиль не прочитался, не должна успеть влить первые два, а потом упасть —
 * повтор тогда начинался бы с половины.
 */
async function mergeProfiles(ctx: StoreContext, bundle: ProfilesBackup) {
  const entries = bundle.profiles.map((entry) => ({
    profile: entry.profile,
    incoming: readMergeDocument(entry.backup, entry.profile.name)
  }));
  const activeId = await getActiveProfileId(ctx);
  let added = 0;
  try {
    for (const { profile, incoming } of entries) {
      added += await mergeIntoProfile(ctx, await profileForMerge(ctx, profile), incoming);
    }
  } finally {
    // Книги пишутся через «текущий профиль» — по пути он переключался. Вернуть
    // прежний обязательно, даже если что-то упало: иначе человек после
    // подключения оказался бы в чужом профиле и решил, что его записи пропали.
    const list = await profileList(ctx);
    await ctx.storage.setItem(PROFILE_LIST_KEY, {
      ...list,
      activeProfileId: activeId
    } satisfies ProfileList);
    ctx.invalidateStateCache();
  }
  return { merged: added };
}

/** Здешний профиль для профиля из копии — найденный или заведённый. */
async function profileForMerge(ctx: StoreContext, profile: UserProfile): Promise<string> {
  const list = await profileList(ctx);
  const same =
    list.profiles.find((existing) => existing.id === profile.id) ??
    list.profiles.find((existing) => sameName(existing.name, profile.name));
  if (same) return same.id;
  const created: UserProfile = {
    id: profile.id || id("profile"),
    name: profile.name.trim().slice(0, 40) || dataText("data.profile.default"),
    color: profile.color || DEFAULT_PROFILE.color,
    createdAt: profile.createdAt || new Date().toISOString()
  };
  list.profiles.push(created);
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  return created.id;
}

/**
 * Влить книгу в профиль `profileId`. Пишется тем же save, что и любая правка
 * (с отметками времени — чтобы добавленное уехало на другие устройства),
 * поэтому профиль на время делается текущим.
 */
async function mergeIntoProfile(
  ctx: StoreContext,
  profileId: string,
  incoming: LocalState
): Promise<number> {
  const list = await profileList(ctx);
  if (list.activeProfileId !== profileId) {
    await ctx.storage.setItem(PROFILE_LIST_KEY, {
      ...list,
      activeProfileId: profileId
    } satisfies ProfileList);
    ctx.invalidateStateCache();
  }
  // Книги у профиля здесь нет вовсе — она едет целиком, вместе с
  // настройками (валюта, тема): добавлять не к чему. Есть ли она, смотрим по
  // перечню ключей: чтение пустого места завело бы начальную книгу, и записи
  // пришлось бы склеивать с категориями по умолчанию без всякой нужды.
  if (!(await ctx.storage.keys()).includes(profileStateKey(profileId))) {
    await ctx.save({ ...incoming, aiApiKey: "" });
    return countRows(incoming);
  }
  const state = await ctx.state();
  const added = mergeRecords(state, incoming);
  await ctx.save(state);
  return added;
}

/**
 * Все профили устройства — для «Объединить» при подключении (ProfilesBackup).
 *
 * Отметку «копия снята» (lastBackupAt), в отличие от `/backup`, не ставит:
 * эту выгрузку человек в файл не сохранял, и сказать ему «копия есть» было
 * бы неправдой.
 */
export async function exportAllProfiles(ctx: StoreContext): Promise<ProfilesBackup> {
  const list = await profileList(ctx);
  const ordered = [
    ...list.profiles.filter((profile) => profile.id === list.activeProfileId),
    ...list.profiles.filter((profile) => profile.id !== list.activeProfileId)
  ];
  const profiles: ProfilesBackup["profiles"] = [];
  for (const profile of ordered) {
    const state =
      profile.id === list.activeProfileId
        ? await ctx.state(false)
        : await readProfileState(ctx, profile);
    if (!state) continue;
    profiles.push({ profile: { ...profile }, backup: await backupDocument(state) });
  }
  return {
    format: "profiles",
    savedAt: new Date().toISOString(),
    activeProfileId: list.activeProfileId,
    profiles
  };
}

/**
 * Книга НЕ текущего профиля — только прочитать: ни переключения, ни записи.
 *
 * Не прочиталась даже по частям — ошибка, а не пропуск: следом за выгрузкой
 * идёт очистка, и молча оставить профиль за бортом значило бы стереть его.
 */
async function readProfileState(
  ctx: StoreContext,
  profile: UserProfile
): Promise<LocalState | null> {
  const raw = await ctx.storage.getItem<unknown>(profileStateKey(profile.id));
  if (raw == null) return null;
  const parsed = localStateSchema.safeParse(raw);
  if (parsed.success) return migrateLocalState(parsed.data);
  const salvaged = salvageLocalState(raw);
  if (salvaged) return migrateLocalState(salvaged.state);
  throw new Error(apiText("api.profile.unreadable", { name: profile.name }));
}
export function isProfilesBackup(value: unknown): value is ProfilesBackup {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === "profiles" &&
    typeof record.activeProfileId === "string" &&
    Array.isArray(record.profiles) &&
    record.profiles.every((entry: unknown) => {
      const item = entry as { profile?: Partial<UserProfile>; backup?: unknown } | null;
      return (
        typeof item?.profile?.id === "string" &&
        typeof item.profile.name === "string" &&
        typeof item.backup === "object" &&
        item.backup !== null
      );
    })
  );
}

/**
 * Книга из копии для объединения. Сломанные строки отбрасываются, как и при
 * чтении своей книги (salvageLocalState): одна кривая строка не повод
 * потерять остальные записи.
 */
function readMergeDocument(document: unknown, profileName?: string): LocalState {
  assertNotNewer(document);
  const parsed = localStateSchema.safeParse(document);
  if (parsed.success) return migrateLocalState(parsed.data);
  const salvaged = salvageLocalState(document);
  if (salvaged) return migrateLocalState(salvaged.state);
  throw new Error(
    profileName
      ? apiText("api.merge.unreadableProfile", { name: profileName })
      : apiText("api.merge.unreadable")
  );
}

/** Сколько строк в книге — ответ объединения, когда книга легла целиком. */
function countRows(state: LocalState): number {
  const record = state as unknown as Record<string, unknown>;
  return STAMPED.reduce((sum, [collection]) => {
    const rows = record[collection];
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
}

/**
 * Копия от более новой версии приложения — так и сказать.
 *
 * Схема такой копии этой версии неизвестна, строгий разбор её не принимает, а
 * спасение по частям не трогает номер схемы — и человек слышал «файл не похож
 * на резервную копию» про свой же файл, снятый на обновлённом телефоне. Дело
 * не в файле, а в версии: обновить приложение — и копия откроется.
 */
export function assertNotNewer(document: unknown): void {
  const version = (document as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === "number" && version > LATEST_LOCAL_STATE_VERSION)
    throw new Error(apiText("api.backup.newerVersion", { version }));
}

/**
 * Книга из копии или файла — строго, а если строго не выходит, тем же
 * спасением, что и своя книга при запуске (salvageLocalState).
 */
export function readableState(raw: unknown) {
  const parsed = localStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return salvageLocalState(raw)?.state ?? null;
}
