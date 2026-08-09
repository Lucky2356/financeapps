import { describe, expect, it } from "vitest";

import {
  ANDROID_PLATFORM,
  WINDOWS_PLATFORM,
  compareVersions,
  findUpdate,
  parseReleaseApi,
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

  // The manifest comes off the network, so a link inside it is a claim, not an
  // instruction: only this project's own release downloads are honoured.
  it("refuses a download link that is not this project's release asset", () => {
    const parsed = parseReleaseManifest({
      version: "1.6.0",
      platforms: {
        "android-universal": { url: "http://example.com/app.apk" },
        "windows-x86_64": { url: "javascript:alert(1)" },
        other: { url: "https://github.com/someone-else/app/releases/download/v9/app.apk" }
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

// latest.json is served from GitHub's release-asset CDN, which some networks
// cannot reach even when github.com answers. api.github.com is a second host
// carrying the same facts, so the phone can still learn a release exists.
describe("release API as a second source", () => {
  const release = {
    tag_name: "v1.7.2",
    published_at: "2026-08-09T09:00:00.000Z",
    body: "Что нового",
    assets: [
      {
        name: "financial-assistant_1.7.2_universal.apk",
        browser_download_url:
          "https://github.com/Lucky2356/financeapps/releases/download/v1.7.2/financial-assistant_1.7.2_universal.apk"
      },
      {
        name: "financial-assistant_1.7.2_x64-setup.exe",
        browser_download_url:
          "https://github.com/Lucky2356/financeapps/releases/download/v1.7.2/financial-assistant_1.7.2_x64-setup.exe"
      },
      { name: "latest.json", browser_download_url: "https://github.com/x/y/releases/download/1/z" }
    ]
  };

  it("reads the same update out of GitHub's release JSON", () => {
    const parsed = parseReleaseApi(release);
    expect(parsed?.version).toBe("1.7.2"); // the leading "v" of the tag is not part of the version
    expect(findUpdate(parsed, "1.6.2", ANDROID_PLATFORM)).toEqual({
      version: "1.7.2",
      url: "https://github.com/Lucky2356/financeapps/releases/download/v1.7.2/financial-assistant_1.7.2_universal.apk",
      notes: "Что нового"
    });
    expect(parsed?.platforms[WINDOWS_PLATFORM]?.url).toMatch(/x64-setup\.exe$/);
  });

  it("ignores assets from another repository", () => {
    const parsed = parseReleaseApi({
      tag_name: "v9.9.9",
      assets: [
        {
          name: "app.apk",
          browser_download_url: "https://github.com/someone-else/app/releases/download/v9/app.apk"
        }
      ]
    });
    expect(findUpdate(parsed, "1.6.2", ANDROID_PLATFORM)).toBeNull();
  });

  it("treats junk as «no update» instead of throwing", () => {
    expect(parseReleaseApi(null)).toBeNull();
    expect(parseReleaseApi({ assets: [] })).toBeNull();
    expect(parseReleaseApi({ tag_name: "v1.7.2", assets: "nope" })?.platforms).toEqual({});
    expect(parseReleaseApi({ tag_name: "v1.7.2", assets: [null, 5] })?.platforms).toEqual({});
  });
});
