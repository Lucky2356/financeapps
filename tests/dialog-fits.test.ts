import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// GUARD: диалог обязан помещаться в экран, и держится это одним пределом в
// примитиве — `max-h-[calc(100svh-2rem)]` с прокруткой внутри
// (components/ui/dialog.tsx). Слой, который центрирует диалог, сам не
// прокручивается, поэтому всё, что вылезло за этот предел, недостижимо: ни
// колесом, ни пальцем.
//
// Беда в том, что предел снимается по неосторожности. `cn()` — это twMerge, и
// он не ДОБАВЛЯЕТ классы места вызова к классам примитива, а заменяет ими
// написанное. Любой свой `max-h-*` стирает предел; любой свой `overflow-*`
// стирает прокрутку.
//
// Так и вышло: командная строка передавала `overflow-hidden`, и в альбомной
// ориентации 75 px её списка обрезались наглухо, а `top-[15%]` — остаток от
// старого способа центрирования — сдвигал её на 91 px вниз, за нижний край.
// Проверить это глазами нельзя: на обычном экране всё выглядит целым.
const DIALOG_FILES_ROOT = ["app", "components"];

/**
 * Классы, которые с места вызова ломают именно то, что держит диалог в экране.
 * Ширина (`max-w-*`, `sm:max-w-*`), отступы и `gap-*` не в списке: они предел
 * по высоте не трогают, и переопределять их — нормальная работа.
 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /(?:^|[\s:])max-h-[[\w.%-]/, why: "max-h-* стирает предел высоты примитива" },
  { pattern: /(?:^|[\s:])max-h-\d/, why: "max-h-* стирает предел высоты примитива" },
  { pattern: /(?:^|[\s:])overflow-(?!y-auto\b)[\w-]+/, why: "overflow-* стирает прокрутку внутри" },
  {
    pattern: /(?:^|[\s:])(?:top|bottom|left|right)-[[\w.%-]/,
    why: "смещение ломает центрирование"
  },
  { pattern: /(?:^|[\s:])translate-[xy]-/, why: "остаток старого центрирования через translate" },
  { pattern: /(?:^|[\s:])h-(?:screen|full)\b/, why: "своя высота вместо предела примитива" }
];

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) found.push(full);
    }
  };
  for (const dir of DIALOG_FILES_ROOT) walk(dir);
  return found;
}

/** Каждый `<DialogContent ... className="...">` вместе с его файлом и строкой. */
function dialogContentClassNames(): Array<{ file: string; line: number; classes: string }> {
  const found: Array<{ file: string; line: number; classes: string }> = [];
  for (const file of sourceFiles()) {
    if (file.endsWith(path.join("ui", "dialog.tsx"))) continue; // сам примитив
    const text = readFileSync(file, "utf8");
    const re = /<DialogContent\b([^>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const attrs = match[1];
      const className = /className="([^"]*)"/.exec(attrs);
      if (!className) continue;
      found.push({
        file,
        line: text.slice(0, match.index).split("\n").length,
        classes: className[1]
      });
    }
  }
  return found;
}

describe("диалоги не переопределяют то, что держит их в экране", () => {
  it("находит места вызова DialogContent — иначе проверка ничего не проверяет", () => {
    expect(dialogContentClassNames().length).toBeGreaterThan(3);
  });

  it("ни один не передаёт свою высоту, прокрутку или смещение", () => {
    const offences: string[] = [];
    for (const { file, line, classes } of dialogContentClassNames()) {
      for (const { pattern, why } of FORBIDDEN) {
        const hit = pattern.exec(classes);
        if (hit) offences.push(`${file}:${line} → «${hit[0].trim()}»: ${why}`);
      }
    }
    expect(offences, `\n${offences.join("\n")}\n`).toEqual([]);
  });

  it("предел высоты в примитиве написан в svh, а не в vh", () => {
    const primitive = readFileSync(path.join("components", "ui", "dialog.tsx"), "utf8");
    // vh — «большой» вьюпорт, при видимой панели браузера он больше видимой
    // части экрана на 50–110 px. Диалог, посчитанный в vh, на телефоне выходит
    // за края в обе стороны, и верх становится недостижим.
    expect(primitive).toContain("max-h-[calc(100svh-2rem)]");
    expect(primitive).not.toMatch(/max-h-\[[^\]]*\dvh/);
  });
});
