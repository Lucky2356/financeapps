"use client";

// Update check for the Android build.
//
// The Tauri updater plugin has no Android implementation, so this reads the same
// `latest.json` the desktop updater uses. The APK is downloaded inside the app
// by InstallerPlugin.kt and handed straight to the system package installer,
// which asks the owner to confirm — the only install path outside the Play
// Store. The browser is never involved.
//
// The request goes through the Tauri HTTP plugin (not the webview's fetch) so it
// is not subject to the page CSP, and the allowed URL is pinned in
// src-tauri/capabilities/mobile.json.

import { APP_VERSION } from "@/lib/constants";
import {
  markAnnounced as scheduleMarkAnnounced,
  markChecked as scheduleMarkChecked,
  shouldAnnounce as scheduleShouldAnnounce,
  shouldCheckNow as scheduleShouldCheckNow
} from "@/lib/updates/schedule";
import {
  ANDROID_PLATFORM,
  LATEST_MANIFEST_URL,
  RELEASE_API_URL,
  findUpdate,
  parseReleaseApi,
  parseReleaseManifest,
  type AvailableUpdate,
  type ReleaseManifest
} from "@/lib/updates/latest";

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetches the newer Android build, or null when this one is current.
 *
 * Two sources, tried in order. `latest.json` sits on GitHub's release-asset CDN
 * (`release-assets.githubusercontent.com`), which some networks cannot reach
 * even though github.com itself answers; `api.github.com` is a different host
 * carrying the same facts. Throws only when BOTH fail, and the message names
 * both failures — on a phone there are no devtools, so the error text shown to
 * the owner is the only diagnosis available.
 */
export async function checkAndroidUpdate(): Promise<AvailableUpdate | null> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");

  async function read(
    url: string,
    parse: (payload: unknown) => ReleaseManifest | null
  ): Promise<AvailableUpdate | null> {
    // Without a connect timeout a black-holed route leaves the button spinning
    // for minutes with nothing to show for it.
    const response = await tauriFetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      connectTimeout: 15_000
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return findUpdate(parse(await response.json()), APP_VERSION, ANDROID_PLATFORM);
  }

  try {
    return await read(LATEST_MANIFEST_URL, parseReleaseManifest);
  } catch (manifestError) {
    try {
      return await read(RELEASE_API_URL, parseReleaseApi);
    } catch (apiError) {
      throw new Error(`latest.json: ${reason(manifestError)} / api: ${reason(apiError)}`);
    }
  }
}

/**
 * Скачать APK и открыть экран установки — не выходя из приложения.
 *
 * Работу делает свой плагин на стороне Android (InstallerPlugin.kt), он же
 * сообщает, сколько скачано. В браузер человека НЕ отправляем ни при каком
 * исходе: в 2.0.0 любая заминка сети молча открывала GitHub, и человек
 * оказывался на чужой странице со скачиванием в шторке — ровно то, от чего это
 * обновление и уводили. Сорвалось — говорим почему и предлагаем повторить.
 */
export async function startAndroidUpdate(
  update: AvailableUpdate,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  const { Channel, invoke } = await import("@tauri-apps/api/core");
  const channel = new Channel<{ received: number; total: number }>();
  if (onProgress) channel.onmessage = (step) => onProgress(step.received, step.total);
  await invoke("plugin:installer|install", { url: update.url, onProgress: channel });
}

/** Слова для toast-ов обновления: зовут из настроек и из фоновой проверки. */
export type UpdateWords = {
  downloading: string;
  progress: (percent: number) => string;
  opening: string;
  failed: string;
  retry: string;
};

/**
 * Весь путь обновления с точки зрения человека: одна строка «Загрузка… 42%»,
 * затем системный экран установки. Сорвалось — та же строка становится
 * ошибкой с кнопкой «Повторить».
 */
export async function installAndroidUpdate(
  update: AvailableUpdate,
  words: UpdateWords
): Promise<void> {
  const { toast } = await import("sonner");
  const id = toast.loading(words.downloading);
  try {
    await startAndroidUpdate(update, (received, total) => {
      if (total > 0) toast.loading(words.progress(Math.floor((received * 100) / total)), { id });
    });
    toast.success(words.opening, { id, duration: 5_000 });
  } catch (error) {
    toast.error(words.failed, {
      id,
      description: reason(error),
      duration: 30_000,
      action: { label: words.retry, onClick: () => void installAndroidUpdate(update, words) }
    });
  }
}

// Scheduling is the same decision on both platforms, so it lives in one place;
// these keep the Android call sites reading as they did.
export const shouldCheckNow = (now?: Date) => scheduleShouldCheckNow("android", now);
export const markChecked = (now?: Date) => scheduleMarkChecked("android", now);
export const shouldAnnounce = (version: string) => scheduleShouldAnnounce("android", version);
export const markAnnounced = (version: string) => scheduleMarkAnnounced("android", version);
