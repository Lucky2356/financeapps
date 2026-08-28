// Asks for every file a release manifest points at, the way an installed copy
// asks for it.
//
// verify-latest-json.mjs checks that the manifest is SHAPED correctly — that
// the updater plugin will parse it. This checks the other half: that the files
// it names are actually there. The two failures look nothing alike from the
// outside and both end the same way, with "обновления недоступны" on a machine
// nobody is watching. The APK in particular is named in the manifest before it
// is built, so until it is uploaded that entry is a promise, not a fact.
//
// Usage: node scripts/verify-release-assets.mjs <manifest-url-or-path>

import { readFileSync } from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/verify-release-assets.mjs <manifest-url-or-path>");
  process.exit(1);
}

const isUrl = /^https?:\/\//i.test(target);
const raw = isUrl
  ? await fetch(target, { redirect: "follow" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} для ${target}`);
      return response.text();
    })
  : readFileSync(target, "utf8");

const manifest = JSON.parse(raw);
const platforms = Object.entries(manifest.platforms ?? {});
if (platforms.length === 0) {
  console.error("В манифесте нет ни одной платформы.");
  process.exit(1);
}

let missing = 0;
for (const [name, entry] of platforms) {
  // HEAD is enough and costs nothing: the installer is ~10 MB and the APK ~40.
  const response = await fetch(entry.url, { method: "HEAD", redirect: "follow" });
  const size = response.headers.get("content-length");
  console.log(`${response.status}  ${name}${size ? `  (${Math.round(size / 1e6)} МБ)` : ""}`);
  if (!response.ok) {
    console.error(`  → ${entry.url}`);
    missing += 1;
  }
}

if (missing > 0) {
  console.error(
    `Манифест указывает на ${missing} файл(а), которых в релизе нет. ` +
      "Обновление приведёт пользователя на 404."
  );
  process.exit(1);
}
console.log("Все файлы, названные в манифесте, на месте.");
