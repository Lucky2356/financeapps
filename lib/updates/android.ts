"use client";

// Update check for the Android build.
//
// The Tauri updater plugin has no Android implementation, so this reads the same
// `latest.json` the desktop updater uses and hands the APK to the system. The
// download and the install itself are Android's job: opening the APK URL starts
// the system download manager, and tapping the finished file opens the package
// installer, which asks the owner to confirm — exactly the flow any sideloaded
// app follows, and the only one available outside the Play Store.
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

/** Opens the APK link; Android downloads it and offers to install. */
export async function startAndroidUpdate(update: AvailableUpdate): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(update.url);
}

// Scheduling is the same decision on both platforms, so it lives in one place;
// these keep the Android call sites reading as they did.
export const shouldCheckNow = (now?: Date) => scheduleShouldCheckNow("android", now);
export const markChecked = (now?: Date) => scheduleMarkChecked("android", now);
export const shouldAnnounce = (version: string) => scheduleShouldAnnounce("android", version);
export const markAnnounced = (version: string) => scheduleMarkAnnounced("android", version);
