// Reading the release manifest (latest.json) that every GitHub release carries.
//
// On Windows the Tauri updater plugin reads this file itself and installs the
// new version in place. Android has NO updater plugin, so the app reads the same
// manifest by hand: it can tell the owner a newer version exists and hand the
// APK to the system, which downloads it and runs the package installer.
//
// The manifest is data from the network, so every field here is treated as
// untrusted: a malformed file must produce "no update", never a crash and never
// a link that was not in the manifest.

export const RELEASES_URL = "https://github.com/Lucky2356/financeapps/releases";
export const LATEST_MANIFEST_URL =
  "https://github.com/Lucky2356/financeapps/releases/latest/download/latest.json";

/** The manifest key the Android build looks under. */
export const ANDROID_PLATFORM = "android-universal";

export type ReleaseManifest = {
  version: string;
  pubDate?: string;
  notes?: string;
  /** Download URL per platform key, e.g. "windows-x86_64", "android-universal". */
  platforms: Record<string, { url: string }>;
};

export type AvailableUpdate = {
  version: string;
  url: string;
  notes?: string;
};

/**
 * Compares two dotted version strings numerically: 1.10.0 is newer than 1.9.9,
 * which a plain string comparison gets wrong. Missing or non-numeric parts count
 * as 0, so "1.5" and "1.5.0" are equal.
 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    String(value)
      .replace(/^v/i, "")
      .split(/[.\-+]/)
      .map((part) => Number.parseInt(part, 10));

  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = Number.isFinite(a[index]) ? a[index] : 0;
    const y = Number.isFinite(b[index]) ? b[index] : 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** Parses a manifest, returning null for anything that is not one. */
export function parseReleaseManifest(payload: unknown): ReleaseManifest | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const version = typeof record.version === "string" ? record.version.trim() : "";
  if (!version) return null;

  const platforms: ReleaseManifest["platforms"] = {};
  if (record.platforms && typeof record.platforms === "object") {
    for (const [key, value] of Object.entries(record.platforms as Record<string, unknown>)) {
      const url = (value as { url?: unknown })?.url;
      // Only https links: the manifest must never be able to point the app at a
      // plain-http download or a custom scheme.
      if (typeof url === "string" && /^https:\/\//i.test(url)) platforms[key] = { url };
    }
  }

  return {
    version,
    pubDate: typeof record.pub_date === "string" ? record.pub_date : undefined,
    notes: typeof record.notes === "string" ? record.notes : undefined,
    platforms
  };
}

/**
 * The update to offer, or null when the installed version is current (or the
 * manifest has nothing for this platform).
 */
export function findUpdate(
  manifest: ReleaseManifest | null,
  currentVersion: string,
  platform: string
): AvailableUpdate | null {
  if (!manifest) return null;
  if (compareVersions(manifest.version, currentVersion) <= 0) return null;
  const target = manifest.platforms[platform];
  if (!target) return null;
  return { version: manifest.version, url: target.url, notes: manifest.notes };
}
