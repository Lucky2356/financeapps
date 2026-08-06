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
  ANDROID_PLATFORM,
  LATEST_MANIFEST_URL,
  findUpdate,
  parseReleaseManifest,
  type AvailableUpdate
} from "@/lib/updates/latest";

const LAST_CHECK_KEY = "android-update-last-check";
const NOTIFIED_VERSION_KEY = "android-update-notified-version";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Fetches the manifest and returns the newer Android build, or null. */
export async function checkAndroidUpdate(): Promise<AvailableUpdate | null> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const response = await tauriFetch(LATEST_MANIFEST_URL, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  return findUpdate(parseReleaseManifest(payload), APP_VERSION, ANDROID_PLATFORM);
}

/** Opens the APK link; Android downloads it and offers to install. */
export async function startAndroidUpdate(update: AvailableUpdate): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(update.url);
}

/**
 * Whether to ask GitHub again. A day used to be the interval, and the check was
 * marked as done BEFORE the request — so a release published an hour after the
 * morning check stayed invisible until the next day, and a failed request cost
 * a whole day too. Six hours costs one small JSON request; what is throttled to
 * once per version is the *notice*, which is the part that could nag.
 */
export function shouldCheckNow(now: Date = new Date()): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    return !Number.isFinite(last) || now.getTime() - last >= CHECK_INTERVAL_MS;
  } catch {
    return false; // no storage → never nag
  }
}

/** Records a check that actually completed. Call it after the request, not before. */
export function markChecked(now: Date = new Date()): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(now.getTime()));
  } catch {
    /* storage unavailable — the next start simply checks again */
  }
}

/** True the first time a given version is found; false on later checks. */
export function shouldAnnounce(version: string): boolean {
  try {
    return localStorage.getItem(NOTIFIED_VERSION_KEY) !== version;
  } catch {
    return true;
  }
}

export function markAnnounced(version: string): void {
  try {
    localStorage.setItem(NOTIFIED_VERSION_KEY, version);
  } catch {
    /* storage unavailable — the notice may repeat, which is the safe direction */
  }
}
