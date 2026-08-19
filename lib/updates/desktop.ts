"use client";

// Update check for the Windows build.
//
// The Tauri updater plugin does the real work: it reads `latest.json`, checks
// the signature against the key baked into the app, installs in place and
// restarts. What this module adds is the two things that failed the owner in
// practice — a second attempt when the first request does not come back, and a
// shape the background runner can use without touching the plugin API.

import { isAndroidShell } from "@/lib/platform/device";
import { isTauriShell } from "@/lib/platform/env";

export type DesktopUpdate = {
  version: string;
  notes: string;
  /** Downloads, installs and restarts into the new build. */
  install: () => Promise<void>;
};

/** The Windows build: a Tauri shell that is not a phone. */
export function isDesktopShell(): boolean {
  return isTauriShell() && !isAndroidShell();
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One retry, because the first attempt fails for reasons that are gone a second
 * later: GitHub's asset CDN answers 404 for a minute after a release is
 * published, and a laptop waking from sleep has no route yet. Without it a
 * single hiccup showed "Автообновление недоступно" and sent the owner to
 * download the installer by hand — which is how a PC sat on 1.9.0 for a week.
 */
async function twice<T>(attempt: () => Promise<T>, delayMs = 2500): Promise<T> {
  try {
    return await attempt();
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      return await attempt();
    } catch (second) {
      throw new Error(`${reason(first)} / повтор: ${reason(second)}`);
    }
  }
}

/** The newer build, or null when this one is current. Throws only if both attempts fail. */
export async function checkDesktopUpdate(): Promise<DesktopUpdate | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await twice(() => check());
  if (!update) return null;

  return {
    version: update.version,
    notes: update.body ?? "",
    install: async () => {
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    }
  };
}
