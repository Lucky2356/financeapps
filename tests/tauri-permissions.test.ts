import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Права оболочки Tauri — не шире нужного. Сторож от того, чтобы права вернули
// «на всякий случай»: прежде страница могла писать, читать и удалять файлы во
// всей домашней папке, хотя ей нужны только файлы, выбранные в диалоге, а
// копии и файл синхронизации пишут команды Rust (src-tauri/src/folder_files.rs).

const root = path.resolve(__dirname, "..");
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"));

type Permission = string | { identifier: string; allow?: unknown[] };

function permissions(file: string): Permission[] {
  return read(file).permissions as Permission[];
}

function ids(file: string): string[] {
  return permissions(file).map((item) => (typeof item === "string" ? item : item.identifier));
}

describe("права оболочки", () => {
  for (const file of [
    "src-tauri/capabilities/default.json",
    "src-tauri/capabilities/mobile.json"
  ]) {
    it(`${file}: странице нельзя удалять файлы и читать папки`, () => {
      expect(ids(file)).not.toContain("fs:allow-remove");
      expect(ids(file)).not.toContain("fs:allow-read-dir");
      expect(ids(file)).not.toContain("fs:allow-read-text-file");
    });
  }

  it("на компьютере доступ к файлам — только выбранные в диалоге", () => {
    const scope = permissions("src-tauri/capabilities/default.json").find(
      (item) => typeof item !== "string" && item.identifier === "fs:scope"
    ) as { allow: unknown[] } | undefined;
    expect(scope?.allow ?? []).toEqual([]);
  });

  it("на телефоне данные самого приложения не в доступе страницы", () => {
    const scope = permissions("src-tauri/capabilities/mobile.json").find(
      (item) => typeof item !== "string" && item.identifier === "fs:scope"
    ) as { allow: string[] };
    expect(scope.allow).not.toContain("$APPDATA/**");
    expect(scope.allow).not.toContain("$APPLOCALDATA/**");
  });

  it("CSP не разрешает встроенные скрипты и локальный сервер разработки", () => {
    const csp = read("src-tauri/tauri.conf.json").app.security.csp as string;
    const scriptSrc = csp.split(";").find((part) => part.trim().startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(csp).not.toContain("localhost");
    expect(csp).not.toContain("127.0.0.1");
  });
});
