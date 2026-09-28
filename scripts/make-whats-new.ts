// Пересобирает lib/whats-new/releases.generated.json из CHANGELOG.md.
//
// Запуск: npm run whats-new
//
// Файл лежит в репозитории, а не собирается на лету: приложение — статическая
// сборка, и читать CHANGELOG ему не из чего. Что файл не отстал от CHANGELOG,
// проверяет tests/whats-new-sync.test.ts — забыли пересобрать, CI красный.

import { readFileSync, writeFileSync } from "node:fs";

import { parseChangelog } from "../lib/whats-new/parse.ts";

const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const releases = parseChangelog(changelog);
writeFileSync(
  new URL("../lib/whats-new/releases.generated.json", import.meta.url),
  `${JSON.stringify(releases, null, 2)}\n`
);
console.log(`whats-new: ${releases.length} выпусков, последний ${releases[0]?.version ?? "—"}`);
