import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// GUARD: the app's Content-Security-Policy allows `script-src 'unsafe-inline'`,
// and that is only harmless while no text a person can type — a description, a
// category name, a CSV cell, a model's answer — can become markup. React
// escapes everything it renders, so the danger is the handful of constructs
// that step around React and hand a string to the DOM or to the interpreter.
//
// This file is the reason `unsafe-inline` stays. It fails the build the moment
// that stops being true, rather than a year later when someone reads the CSP
// and takes the audit note on trust.
const SOURCE_DIRS = ["app", "components", "hooks", "lib", "services", "types"];

/**
 * Constructs that hand a string straight to the HTML parser or the interpreter.
 * There is no safe use of any of these in this app, so the allowed count is
 * zero — no exceptions list, on purpose: an exception here is the whole hole.
 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\.innerHTML\s*=/, why: "присваивание innerHTML" },
  { pattern: /\.outerHTML\s*=/, why: "присваивание outerHTML" },
  { pattern: /\.insertAdjacentHTML\s*\(/, why: "insertAdjacentHTML" },
  { pattern: /\bdocument\s*\.\s*write\s*\(/, why: "document.write" },
  { pattern: /\beval\s*\(/, why: "eval" },
  { pattern: /\bnew\s+Function\s*\(/, why: "new Function" },
  { pattern: /\bsrcDoc\s*=/, why: "srcDoc у iframe" }
];

/**
 * The one exception the app does need: a script stamped into <head> so the
 * saved display density applies before the first paint. It carries no data —
 * it reads localStorage itself — and the test below proves that rather than
 * taking the name's word for it.
 *
 * Adding a name here is a deliberate decision, and it costs whoever adds it the
 * proof: the value has to be a module-level constant with nothing interpolated.
 */
const ALLOWED_HTML_CONSTANTS = new Set(["DENSITY_FOUC_SCRIPT"]);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "node_modules" && entry !== "generated") walk(full);
      } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
        found.push(full);
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(path.join(process.cwd(), dir));
  return found;
}

const FILES = sourceFiles().map((file) => ({
  file: path.relative(process.cwd(), file),
  lines: readFileSync(file, "utf8").split("\n")
}));

/** Every `key: value` in the codebase, as "file:line — text", for a readable failure. */
function hits(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const { file, lines } of FILES) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) found.push(`${file}:${index + 1} — ${line.trim()}`);
    });
  }
  return found;
}

describe("в разметку не попадает чужой текст", () => {
  it("исходники вообще есть — иначе тест зелёный по недосмотру", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  FORBIDDEN.forEach(({ pattern, why }) => {
    it(`не использует ${why}`, () => {
      expect(hits(pattern)).toEqual([]);
    });
  });

  // dangerouslySetInnerHTML is the one that has a legitimate use, so it is
  // checked rather than banned: the value must be a bare CAPS identifier from
  // the allow list — never an expression, a prop, or a template.
  it("dangerouslySetInnerHTML принимает только разрешённую константу", () => {
    const uses = hits(/dangerouslySetInnerHTML/);
    const wrong = uses.filter((use) => {
      const match = /__html:\s*([A-Z][A-Z0-9_]*)\s*\}\}/.exec(use);
      return !match || !ALLOWED_HTML_CONSTANTS.has(match[1]);
    });
    expect(wrong).toEqual([]);
  });

  // The teeth of the whole file. A name on the allow list means nothing if the
  // value behind it can grow a `${...}`: that is exactly how user data would
  // get in without a single new call site.
  ALLOWED_HTML_CONSTANTS.forEach((name) => {
    it(`${name} — константа без подстановок`, () => {
      const declarations = hits(new RegExp(`(export\\s+)?const\\s+${name}\\s*=`));
      expect(declarations).toHaveLength(1);

      const [where] = declarations;
      const value = where.slice(where.indexOf("=") + 1).trim();
      expect(value.startsWith("`") || value.startsWith('"') || value.startsWith("'")).toBe(true);
      expect(value).not.toContain("${");
    });
  });
});
