// Пересобирает lib/whats-new/releases.generated.json из CHANGELOG.md и
// lib/whats-new/releases.generated.en.json из CHANGELOG.en.md.
//
// Запуск: npm run whats-new
//
// Файлы лежат в репозитории, а не собираются на лету: приложение — статическая
// сборка, и читать CHANGELOG ему не из чего. Что файлы не отстали от
// CHANGELOG, проверяет tests/whats-new.test.tsx — забыли пересобрать, CI
// красный.
//
// JSON.stringify с отступом 2 — ровно то, что выдал бы prettier: файлы
// проходят `prettier --check` без отдельного прогона.

import { readFileSync, writeFileSync } from "node:fs";

import { englishReleases, parseChangelog } from "../lib/whats-new/parse.ts";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const write = (name: string, data: unknown) =>
  writeFileSync(
    new URL(`../lib/whats-new/${name}`, import.meta.url),
    `${JSON.stringify(data, null, 2)}\n`
  );

const releases = parseChangelog(read("CHANGELOG.md"));
write("releases.generated.json", releases);
console.log(`whats-new: ${releases.length} выпусков, последний ${releases[0]?.version ?? "—"}`);

const english = englishReleases(read("CHANGELOG.en.md"), releases);
write("releases.generated.en.json", english);
const missing = releases.filter((r) => !english.some((e) => e.version === r.version));
console.log(
  `whats-new (en): ${english.length} выпусков` +
    (missing.length > 0
      ? `; без перевода: ${missing.map((r) => r.version).join(", ")} — окно покажет их по-русски`
      : "")
);
