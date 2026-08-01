"use client";

import { isTauriShell } from "@/lib/platform/env";

/**
 * True when the Tauri shell is running on Android.
 *
 * The phone build ships the *same* frontend bundle as the Windows one — same
 * screens, same on-device data, same features — so no feature gate keys off the
 * device. Only the few places that reach for a plugin without a mobile
 * implementation (window state, the in-place updater) need to know they are on
 * a phone, and the webview user agent answers that without pulling in another
 * Tauri plugin.
 */
export function isAndroidShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return isTauriShell() && /android/i.test(navigator.userAgent);
}
