import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real release script against a fake bundle directory.
//
// The manifest it writes is the ONLY thing standing between a release and every
// desktop install: tauri-plugin-updater parses `platforms` into a map of
// `{ url, signature }` with BOTH fields required, so a single entry missing one
// makes the plugin reject the whole file and every client reports "обновления
// недоступны". That is what shipped in 1.6.0, and this test is the guard.
const SCRIPT = resolve(__dirname, "..", "scripts", "make-latest-json.mjs");
const VERSION = "9.9.9";

let workspace: string;
let bundleDir: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "latest-json-"));
  bundleDir = join(workspace, "src-tauri", "target", "release", "bundle", "nsis");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(join(bundleDir, `financial-assistant_${VERSION}_x64-setup.exe`), "fake installer");
  writeFileSync(join(bundleDir, `financial-assistant_${VERSION}_x64-setup.exe.sig`), "SIGNATURE\n");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function runScript() {
  execFileSync(process.execPath, [SCRIPT, `v${VERSION}`], { cwd: workspace, encoding: "utf8" });
  return JSON.parse(readFileSync(join(bundleDir, "latest.json"), "utf8"));
}

describe("make-latest-json", () => {
  it("gives every platform both fields the updater requires", () => {
    const manifest = runScript();

    expect(Object.keys(manifest.platforms).length).toBeGreaterThan(0);
    for (const [platform, entry] of Object.entries<Record<string, unknown>>(manifest.platforms)) {
      expect(typeof entry.url, `${platform}.url`).toBe("string");
      expect(typeof entry.signature, `${platform}.signature`).toBe("string");
    }
  });

  it("points Windows at the signed installer and Android at the APK", () => {
    const manifest = runScript();

    expect(manifest.version).toBe(VERSION);
    expect(manifest.platforms["windows-x86_64"]).toEqual({
      signature: "SIGNATURE",
      url: `https://github.com/Lucky2356/financeapps/releases/download/v${VERSION}/financial-assistant_${VERSION}_x64-setup.exe`
    });
    // The APK is uploaded by hand after the build, so the manifest names it
    // ahead of time — the name in docs/ANDROID.md has to match exactly.
    expect(manifest.platforms["android-universal"].url).toBe(
      `https://github.com/Lucky2356/financeapps/releases/download/v${VERSION}/financial-assistant_${VERSION}_universal.apk`
    );
  });
});
