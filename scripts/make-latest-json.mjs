// Builds the Tauri updater manifest (latest.json) from the signed NSIS bundle
// produced by `tauri build --config src-tauri/tauri.updater.conf.json`.
//
// Usage: node scripts/make-latest-json.mjs <tag> [repo]
//   <tag>  GitHub release tag, e.g. v1.0.2 (the leading "v" is stripped for version)
//   [repo] owner/repo (defaults to Lucky2356/financeapps)
//
// Reads the installer + its .sig from src-tauri/target/release/bundle/nsis and
// writes latest.json alongside them. The download URL is percent-encoded so the
// Cyrillic, space-containing installer name resolves correctly.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const tag = process.argv[2];
const repo = process.argv[3] || "Lucky2356/financeapps";
if (!tag) {
  console.error("Usage: node scripts/make-latest-json.mjs <tag> [owner/repo]");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const bundleDir = join("src-tauri", "target", "release", "bundle", "nsis");

const files = readdirSync(bundleDir);
// Prefer the installer matching this release version (the bundle dir can hold
// stale installers from earlier local builds); fall back to any setup.exe.
const installer =
  files.find((f) => f.includes(`_${version}_`) && f.endsWith("-setup.exe")) ??
  files.find((f) => f.endsWith("-setup.exe"));
const sigFile =
  files.find((f) => f.includes(`_${version}_`) && f.endsWith("-setup.exe.sig")) ??
  files.find((f) => f.endsWith("-setup.exe.sig"));

if (!installer || !sigFile) {
  console.error(`Installer or .sig not found in ${bundleDir}. Found: ${files.join(", ")}`);
  process.exit(1);
}

const signature = readFileSync(join(bundleDir, sigFile), "utf8").trim();
const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(
  tag
)}/${encodeURIComponent(installer)}`;

// The Android APK is built and uploaded separately (its signing keystore never
// leaves the owner's machine), but its asset name is fixed by the build, so the
// manifest can point at it before it is uploaded.
//
// The `signature` below is deliberately EMPTY, and it must still be present:
// tauri-plugin-updater deserializes `platforms` into a map of
// `{ url, signature }` where signature is a required String, so ONE entry
// without it makes the plugin reject the WHOLE manifest — including the Windows
// entry. That is exactly how 1.6.0 broke desktop auto-update. Nothing ever reads
// this value: the plugin only looks up the signature of its own target, and on
// Android the APK's own signing key is what the system verifies on install.
const apkName = `financial-assistant_${version}_universal.apk`;
const apkUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${apkName}`;

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature, url },
    "android-universal": { signature: "", url: apkUrl }
  }
};

// Fail loudly rather than publish a manifest the updater cannot parse. A broken
// manifest is invisible until a user clicks "check for updates" and is told
// updates are unavailable — by which time it is already on the release page.
for (const [platform, entry] of Object.entries(manifest.platforms)) {
  const missing = ["url", "signature"].filter((field) => typeof entry[field] !== "string");
  if (missing.length > 0) {
    console.error(
      `latest.json: платформа "${platform}" без обязательных полей: ${missing.join(", ")}. ` +
        "tauri-plugin-updater отвергнет весь манифест целиком."
    );
    process.exit(1);
  }
}

const outPath = join(bundleDir, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`  installer: ${installer}`);
console.log(`  url:       ${url}`);
console.log(`  apk:       ${apkUrl}`);
