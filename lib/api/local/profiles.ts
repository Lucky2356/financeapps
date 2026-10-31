// Профили устройства: список, текущий, завести, переименовать, переключить,
// удалить, пример. Каждый профиль — отдельная книга в хранилище под своим
// ключом (profileStateKey); список и текущий лежат под PROFILE_LIST_KEY.
// Вынесено из LocalApiClient; зовётся через StoreContext.

import { id } from "@/lib/api/local/helpers";
import { localStateSchema } from "@/lib/api/local/schemas";
import { createBlankState, createInitialState, migrateLocalState } from "@/lib/api/local/state";
import type { StoreContext } from "@/lib/api/local/store-context";
import { apiText } from "@/lib/i18n/api-text";
import { dataText } from "@/lib/i18n/data-text";
import {
  PRE_UPGRADE_SUFFIX,
  RESCUE_SUFFIX,
  TRASH_SUFFIX
} from "@/lib/storage/SyncingStorageAdapter";
import { SAMPLE_PROFILE_ID, type ProfileList, type UserProfile } from "@/types/profiles";

export const LEGACY_STATE_KEY = "localFinanceState";
export const PROFILE_LIST_KEY = "profileList";

export function profileStateKey(profileId: string): string {
  return `localFinanceState_${profileId}`;
}

// Имя — русский образец; профиль, который заводится, называется на языке
// интерфейса (dataText("data.profile.main")), и дальше имя — его.
export const DEFAULT_PROFILE: UserProfile = {
  id: "profile-default",
  name: "Основной",
  color: "#0d9488",
  createdAt: "1970-01-01T00:00:00.000Z"
};

export async function getActiveProfileId(ctx: StoreContext): Promise<string> {
  const list = await profileList(ctx);
  return list.activeProfileId;
}

export async function profileList(ctx: StoreContext): Promise<ProfileList> {
  const stored = await ctx.storage.getItem<ProfileList>(PROFILE_LIST_KEY);
  if (stored && Array.isArray(stored.profiles) && stored.profiles.length > 0) return stored;

  // Migration: check for legacy state
  const legacy = await ctx.storage.getItem<unknown>(LEGACY_STATE_KEY);
  const defaultProfile: UserProfile = {
    id: "profile-default",
    name: dataText("data.profile.main"),
    color: "#0d9488",
    createdAt: new Date().toISOString()
  };
  const list: ProfileList = { profiles: [defaultProfile], activeProfileId: defaultProfile.id };

  if (legacy) {
    const parsed = localStateSchema.safeParse(legacy);
    await ctx.storage.setItem(
      profileStateKey(defaultProfile.id),
      parsed.success ? migrateLocalState(parsed.data) : legacy
    );
    await ctx.storage.removeItem(LEGACY_STATE_KEY);
    ctx.invalidateStateCache();
  }

  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  return list;
}

export async function createProfile(
  ctx: StoreContext,
  name: string,
  color: string
): Promise<UserProfile> {
  const list = await profileList(ctx);
  const profile: UserProfile = {
    id: id("profile"),
    name: name.trim().slice(0, 40) || dataText("data.profile.new"),
    color,
    createdAt: new Date().toISOString()
  };
  list.profiles.push(profile);
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  await ctx.storage.setItem(profileStateKey(profile.id), createInitialState());
  return profile;
}

export async function renameProfile(
  ctx: StoreContext,
  profileId: string,
  name: string
): Promise<void> {
  const list = await profileList(ctx);
  const profile = list.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  profile.name = name.trim().slice(0, 40) || profile.name;
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
}

export async function switchProfile(ctx: StoreContext, profileId: string): Promise<void> {
  const list = await profileList(ctx);
  if (!list.profiles.find((p) => p.id === profileId))
    throw new Error(apiText("api.profile.notFound"));
  list.activeProfileId = profileId;
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  ctx.invalidateStateCache();
}

/** Завести профиль «Пример» (или взять прежний) и сделать его текущим. */
export async function openSampleProfile(ctx: StoreContext): Promise<void> {
  const list = await profileList(ctx);
  if (!list.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)) {
    list.profiles.push({
      id: SAMPLE_PROFILE_ID,
      name: dataText("data.profile.sample"),
      color: "#a855f7",
      createdAt: new Date().toISOString()
    });
  }
  if (list.activeProfileId !== SAMPLE_PROFILE_ID) list.returnTo = list.activeProfileId;
  list.activeProfileId = SAMPLE_PROFILE_ID;
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  ctx.invalidateStateCache();
}

/** Вернуться из примера к своим данным; по желанию — убрать пример совсем. */
export async function leaveSampleProfile(ctx: StoreContext, remove: boolean): Promise<void> {
  const list = await profileList(ctx);
  const back =
    list.profiles.find((p) => p.id === list.returnTo && p.id !== SAMPLE_PROFILE_ID) ??
    list.profiles.find((p) => p.id !== SAMPLE_PROFILE_ID);
  if (!back) {
    // Кроме примера профилей нет — заводим основной, пустой.
    await createProfile(ctx, dataText("data.profile.main"), "#0d9488");
    return leaveSampleProfile(ctx, remove);
  }
  list.activeProfileId = back.id;
  delete list.returnTo;
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  ctx.invalidateStateCache();
  if (remove && list.profiles.some((p) => p.id === SAMPLE_PROFILE_ID)) {
    await deleteProfile(ctx, SAMPLE_PROFILE_ID);
  }
}

export async function deleteProfile(ctx: StoreContext, profileId: string): Promise<void> {
  const list = await profileList(ctx);
  if (list.profiles.length <= 1) throw new Error(apiText("api.profile.lastOne"));
  list.profiles = list.profiles.filter((p) => p.id !== profileId);
  if (list.activeProfileId === profileId) list.activeProfileId = list.profiles[0].id;
  await ctx.storage.setItem(PROFILE_LIST_KEY, list);
  // Пустая книга ПОВЕРХ, а не removeItem — по той же причине, что и в
  // clearEverything. removeItem убирает только с этого устройства: профиль
  // «Секрет» оставался на службе целиком, следующая же сверка привозила его
  // обратно, «Очистить все данные» его не видело (в списке профилей его уже
  // нет), а новое устройство получало его при первом подключении. Пустота,
  // записанная как правка, уезжает на службу и затирает книгу и там.
  // Есть ли книга, смотрим по перечню ключей, а не чтением: испорченная
  // книга не прочитается, а затереть её пустотой нужно всё равно.
  const key = profileStateKey(profileId);
  if ((await ctx.storage.keys()).includes(key)) {
    await ctx.storage.setItem(key, createBlankState([]));
  }
  // Местные копии этой книги — корзина, копия до обновления схемы, копия при
  // поломке — держат её содержимое целиком; удалённый профиль не должен
  // переживать удаление в них.
  for (const suffix of [TRASH_SUFFIX, PRE_UPGRADE_SUFFIX, RESCUE_SUFFIX]) {
    await ctx.storage.removeItem(`${key}${suffix}`);
  }
  ctx.invalidateStateCache();
}
