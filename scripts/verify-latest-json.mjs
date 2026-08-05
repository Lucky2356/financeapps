// Checks a release manifest against what tauri-plugin-updater actually accepts,
// BEFORE it reaches a release page.
//
// The plugin deserializes `platforms` into a map of `{ url, signature }` where
// both fields are required, so one bad entry makes it reject the whole file and
// every desktop install reports "обновления недоступны". That shipped in 1.6.0.
//
// `scripts/make-latest-json.mjs` guards what it generates; this guards the file
// itself, which is what matters when someone edits or re-uploads one by hand.
//
// Usage:
//   node scripts/verify-latest-json.mjs <path-or-url> [expected-version]

import { readFileSync } from "node:fs";

const target = process.argv[2];
const expectedVersion = process.argv[3];
if (!target) {
  console.error("Usage: node scripts/verify-latest-json.mjs <path-or-url> [expected-version]");
  process.exit(1);
}

async function load(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status} для ${source}`);
    return response.text();
  }
  return readFileSync(source, "utf8");
}

const problems = [];

let manifest;
try {
  manifest = JSON.parse(await load(target));
} catch (error) {
  console.error(`Манифест не читается: ${error.message}`);
  process.exit(1);
}

if (typeof manifest.version !== "string" || manifest.version.trim() === "") {
  problems.push("нет поля version");
} else if (expectedVersion && manifest.version !== expectedVersion.replace(/^v/, "")) {
  problems.push(`version = ${manifest.version}, ожидалась ${expectedVersion.replace(/^v/, "")}`);
}

// pub_date is optional for the plugin, but a malformed one fails the whole parse.
if (manifest.pub_date !== undefined && Number.isNaN(Date.parse(manifest.pub_date))) {
  problems.push(`pub_date не разбирается: ${manifest.pub_date}`);
}

const platforms = manifest.platforms;
if (!platforms || typeof platforms !== "object" || Object.keys(platforms).length === 0) {
  problems.push("нет ни одной платформы");
} else {
  for (const [name, entry] of Object.entries(platforms)) {
    if (!entry || typeof entry !== "object") {
      problems.push(`${name}: не объект`);
      continue;
    }
    // Both are required by the plugin's struct — a missing one is fatal for
    // EVERY platform, not just this entry.
    if (typeof entry.signature !== "string") problems.push(`${name}: нет поля signature`);
    if (typeof entry.url !== "string") problems.push(`${name}: нет поля url`);
    else if (!/^https:\/\//i.test(entry.url)) problems.push(`${name}: url не https — ${entry.url}`);
  }
  // The desktop build is the one that auto-installs; losing it is silent.
  if (!platforms["windows-x86_64"]) problems.push("нет записи windows-x86_64");
}

if (problems.length > 0) {
  console.error(`Манифест ${target} непригоден для плагина обновлений:`);
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

console.log(`Манифест в порядке: версия ${manifest.version}, платформы:`);
for (const [name, entry] of Object.entries(platforms)) {
  console.log(`  ${name} → ${entry.url}`);
}
