// Checks that the version is the SAME number in every file that ships it, and —
// when a tag is given — that the tag says that number too.
//
// The release manifest (latest.json) takes its version from the git tag, while
// the app takes its own from package.json (next.config.mjs exposes it as
// NEXT_PUBLIC_APP_VERSION). Nothing used to compare the two. Tag v1.23.0 with a
// forgotten bump and the release goes out green: the manifest promises 1.23.0,
// the installed copy still calls itself 1.22.1, so every PC and every phone
// offers the same update forever and installing it changes nothing. There is no
// undo for that — only another release with the numbers agreeing.
//
// Paths are relative to the working directory, so a test can run this against a
// fixture tree the way tests/make-latest-json.test.ts does.
//
// Usage:
//   node scripts/verify-release-version.mjs          # the files agree with each other
//   node scripts/verify-release-version.mjs v1.22.2  # ...and with the tag

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts) => readFileSync(join(...parts), "utf8");

// Every place the version has to be spelled out, and what breaks when this one
// is the one left behind.
const sources = [
  {
    file: "package.json",
    // The number the app shows and, on Android, the number it compares against
    // the manifest to decide whether an update exists.
    read: () => JSON.parse(read("package.json")).version
  },
  {
    file: "src-tauri/tauri.conf.json",
    // What tauri-plugin-updater compares against latest.json on the desktop.
    read: () => JSON.parse(read("src-tauri", "tauri.conf.json")).version
  },
  {
    file: "src-tauri/Cargo.toml",
    // The binary's version, and versionName in the APK.
    read: () => read("src-tauri", "Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  },
  {
    file: "src-tauri/Cargo.lock",
    // Left behind, cargo rewrites the lock mid-build and --locked fails.
    read: () =>
      read("src-tauri", "Cargo.lock").match(
        /^\[\[package\]\]\r?\nname = "financial-assistant"\r?\nversion = "([^"]+)"/m
      )?.[1]
  }
];

const found = sources.map((source) => {
  let version;
  try {
    version = source.read();
  } catch (error) {
    console.error(`::error::${source.file} не читается: ${error.message}`);
    process.exit(1);
  }
  if (!version) {
    console.error(`::error::В ${source.file} не нашлась версия — файл изменился по форме.`);
    process.exit(1);
  }
  return { file: source.file, version };
});

for (const { file, version } of found) {
  console.log(`${version.padEnd(12)} ${file}`);
}

const problems = [];

// Against each other first: this is the check that runs on every pull request,
// where there is no tag yet and a half-finished bump still gets caught.
const [reference, ...rest] = found;
const disagreeing = rest.filter((other) => other.version !== reference.version);
for (const other of disagreeing) {
  problems.push(
    `${other.file}: ${other.version}, а в ${reference.file}: ${reference.version}. ` +
      "Версия обязана быть одна во всех файлах."
  );
}

const tag = process.argv[2];
if (tag) {
  const expected = tag.trim().replace(/^v/, "");
  // When the files already disagree the mismatch above is the thing to fix, and
  // repeating it once per file only buries it.
  const offenders = disagreeing.length > 0 ? found : [reference];
  for (const { file, version } of offenders) {
    if (version !== expected) {
      problems.push(
        `${file}: ${version}, а тег обещает ${expected}. ` +
          "Релиз с таким расхождением будет вечно предлагать обновление, которое ничего не меняет."
      );
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
}

console.log(
  tag
    ? `Версия ${reference.version} совпадает с тегом ${tag}.`
    : `Версия ${reference.version} — везде одна.`
);
