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

/** The GitHub API for the same release — a second source when the CDN that
 * serves release assets is unreachable but api.github.com is not. */
export const RELEASE_API_URL = "https://api.github.com/repos/Lucky2356/financeapps/releases/latest";

/** The manifest key the Android build looks under. */
export const ANDROID_PLATFORM = "android-universal";
export const WINDOWS_PLATFORM = "windows-x86_64";

/**
 * Download links must live under this project's own releases. The manifest
 * arrives over the network, so "https" alone is not enough: pinning the prefix
 * means a tampered or mistaken manifest cannot point the phone at an APK from
 * somewhere else.
 */
const DOWNLOAD_PREFIX = `${RELEASES_URL}/download/`;

function trustedDownload(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(DOWNLOAD_PREFIX);
}

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
      if (trustedDownload(url)) platforms[key] = { url };
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
 * Reads GitHub's own release JSON into the same shape as the manifest, so the
 * caller can treat the two sources interchangeably. Used as a fallback: the
 * manifest lives on the release-asset CDN, and a network that cannot reach that
 * CDN can often still reach api.github.com.
 */
export function parseReleaseApi(payload: unknown): ReleaseManifest | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const version = (typeof record.tag_name === "string" ? record.tag_name : "")
    .trim()
    .replace(/^v/i, "");
  if (!version) return null;

  const platforms: ReleaseManifest["platforms"] = {};
  const assets = Array.isArray(record.assets) ? record.assets : [];
  for (const asset of assets) {
    const { name, browser_download_url: url } = (asset ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !trustedDownload(url)) continue;
    if (/\.apk$/i.test(name)) platforms[ANDROID_PLATFORM] = { url };
    else if (/\.exe$/i.test(name)) platforms[WINDOWS_PLATFORM] = { url };
  }

  return {
    version,
    pubDate: typeof record.published_at === "string" ? record.published_at : undefined,
    notes: typeof record.body === "string" ? record.body : undefined,
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
