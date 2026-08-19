"use client";

// When to ask GitHub again, and when to say something about the answer.
//
// Both builds need the same two decisions — Android reads the release manifest
// itself, Windows asks the Tauri updater — so the bookkeeping lives here once,
// keyed per platform. The keys are part of the contract: renaming one makes
// every installed copy think it has never checked.

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateChannel = "android" | "desktop";

const KEYS: Record<UpdateChannel, { lastCheck: string; notified: string }> = {
  // Unchanged since 1.5.1 — phones already carry these two entries.
  android: {
    lastCheck: "android-update-last-check",
    notified: "android-update-notified-version"
  },
  desktop: {
    lastCheck: "desktop-update-last-check",
    notified: "desktop-update-notified-version"
  }
};

/**
 * Whether to ask GitHub again. A day used to be the interval, and the check was
 * marked as done BEFORE the request — so a release published an hour after the
 * morning check stayed invisible until the next day, and a failed request cost
 * a whole day too. Six hours costs one small JSON request; what is throttled to
 * once per version is the *notice*, which is the part that could nag.
 */
export function shouldCheckNow(channel: UpdateChannel, now: Date = new Date()): boolean {
  try {
    const last = Number(localStorage.getItem(KEYS[channel].lastCheck) ?? 0);
    return !Number.isFinite(last) || now.getTime() - last >= CHECK_INTERVAL_MS;
  } catch {
    return false; // no storage → never nag
  }
}

/** Records a check that actually completed. Call it after the request, not before. */
export function markChecked(channel: UpdateChannel, now: Date = new Date()): void {
  try {
    localStorage.setItem(KEYS[channel].lastCheck, String(now.getTime()));
  } catch {
    /* storage unavailable — the next start simply checks again */
  }
}

/** True the first time a given version is found; false on later checks. */
export function shouldAnnounce(channel: UpdateChannel, version: string): boolean {
  try {
    return localStorage.getItem(KEYS[channel].notified) !== version;
  } catch {
    return true;
  }
}

export function markAnnounced(channel: UpdateChannel, version: string): void {
  try {
    localStorage.setItem(KEYS[channel].notified, version);
  } catch {
    /* storage unavailable — the notice may repeat, which is the safe direction */
  }
}
