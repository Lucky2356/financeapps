import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// A `-foreground` token is the colour to put ON TOP of its solid fill, not a
// colour for text sitting on a card. The two themes define them as opposites —
// white in light, near-black in dark — so `text-success-foreground` on a normal
// surface renders white-on-white in the light theme and black-on-black in the
// dark one. That is how the income totals became invisible in BOTH themes.
//
// The plain token (`text-success`) is the readable one: it is defined as a
// mid-tone that contrasts with the surface in either theme. This test is the
// guard, because the wrong class looks perfectly reasonable while you write it.
const ROOT = resolve(__dirname, "..");
const SOURCE_DIRS = ["app", "components", "hooks", "lib"];
const OFFENDER = /text-(success|warning|info)-foreground/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

describe("theme tokens", () => {
  it("never colours text with a -foreground token meant for a solid fill", () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (OFFENDER.test(line)) {
              offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1}`);
            }
          });
      }
    }

    expect(offenders, `use text-success / text-warning / text-info instead`).toEqual([]);
  });

  it("defines both themes for every semantic colour", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    // Each token must appear twice: once in :root (light) and once in .dark.
    for (const token of ["--success", "--warning", "--info", "--destructive"]) {
      const occurrences = css.split(`${token}:`).length - 1;
      expect(occurrences, `${token} must be defined in both themes`).toBeGreaterThanOrEqual(2);
    }
  });
});
