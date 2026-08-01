import { describe, expect, it } from "vitest";

import {
  ANDROID_PLATFORM,
  compareVersions,
  findUpdate,
  parseReleaseManifest
} from "@/lib/updates/latest";

const manifest = {
  version: "1.6.0",
  pub_date: "2026-08-02T10:00:00.000Z",
  platforms: {
    "windows-x86_64": {
      url: "https://github.com/Lucky2356/financeapps/releases/download/v1.6.0/setup.exe"
    },
    "android-universal": {
      url: "https://github.com/Lucky2356/financeapps/releases/download/v1.6.0/app.apk"
    }
  }
};

describe("release manifest", () => {
  it("compares versions numerically, not alphabetically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.5.1", "1.5.1")).toBe(0);
    expect(compareVersions("v1.5.0", "1.5.1")).toBe(-1);
    // A missing patch part is zero, not "unknown".
    expect(compareVersions("1.5", "1.5.0")).toBe(0);
  });

  it("offers the Android download when the release is newer", () => {
    const update = findUpdate(parseReleaseManifest(manifest), "1.5.1", ANDROID_PLATFORM);
    expect(update).toEqual({
      version: "1.6.0",
      url: "https://github.com/Lucky2356/financeapps/releases/download/v1.6.0/app.apk",
      notes: undefined
    });
  });

  it("offers nothing when the installed version is current or newer", () => {
    const parsed = parseReleaseManifest(manifest);
    expect(findUpdate(parsed, "1.6.0", ANDROID_PLATFORM)).toBeNull();
    expect(findUpdate(parsed, "1.7.0", ANDROID_PLATFORM)).toBeNull();
  });

  it("offers nothing when the release has no build for this platform", () => {
    const windowsOnly = parseReleaseManifest({
      version: "1.6.0",
      platforms: { "windows-x86_64": { url: "https://example.com/setup.exe" } }
    });
    expect(findUpdate(windowsOnly, "1.5.1", ANDROID_PLATFORM)).toBeNull();
  });

  it("refuses a download link that is not https", () => {
    const parsed = parseReleaseManifest({
      version: "1.6.0",
      platforms: {
        "android-universal": { url: "http://example.com/app.apk" },
        "windows-x86_64": { url: "javascript:alert(1)" }
      }
    });
    expect(parsed?.platforms).toEqual({});
    expect(findUpdate(parsed, "1.5.1", ANDROID_PLATFORM)).toBeNull();
  });

  it("treats junk as «no update» instead of throwing", () => {
    expect(parseReleaseManifest(null)).toBeNull();
    expect(parseReleaseManifest("nope")).toBeNull();
    expect(parseReleaseManifest({ platforms: {} })).toBeNull();
    expect(findUpdate(null, "1.5.1", ANDROID_PLATFORM)).toBeNull();
  });
});
