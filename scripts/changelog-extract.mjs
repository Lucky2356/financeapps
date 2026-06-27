#!/usr/bin/env node
// Extracts a single version's section from CHANGELOG.md so the release workflow
// can use it as the GitHub Release body (a curated "what's new" on top of the
// auto-generated commit list). Keeps release notes DRY: CHANGELOG is the source.
//
// Usage: node scripts/changelog-extract.mjs v1.0.5   (prints the section to stdout)
import { readFileSync } from "node:fs";

const version = (process.argv[2] ?? "").replace(/^v/, "").trim();
if (!version) {
  console.error("Usage: changelog-extract.mjs <version>  (e.g. v1.0.5)");
  process.exit(1);
}

const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const lines = changelog.split(/\r?\n/);

const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`No CHANGELOG section found for [${version}].`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith("## [")) {
    end = i;
    break;
  }
}

// Drop the "## [x.y.z] — date" heading itself — the GitHub Release title already
// carries the version. Emit just the body so it reads cleanly on the release page.
const body = lines
  .slice(start + 1, end)
  .join("\n")
  .trim();
process.stdout.write(`${body}\n`);
