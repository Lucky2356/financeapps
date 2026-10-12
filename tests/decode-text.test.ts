// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserFileSystemAdapter } from "@/lib/files/BrowserFileSystemAdapter";
import { decodeTextBytes } from "@/lib/files/decode-text";

/** Строка в Windows-1251 — так её пишут выгрузки Сбера и 1С. */
function cp1251(text: string): Uint8Array {
  return Uint8Array.from([...text], (char) => {
    const code = char.charCodeAt(0);
    if (code < 0x80) return code;
    if (char === "Ё") return 0xa8;
    if (char === "ё") return 0xb8;
    if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
    throw new Error(`no cp1251 byte for ${char}`);
  });
}

const header = "Дата операции;Сумма;Описание\n05.10.2026;-200;Кофе Ёлка";

describe("decodeTextBytes", () => {
  it("reads UTF-8 as before, dropping the BOM", () => {
    const utf8 = new TextEncoder().encode("\uFEFF" + header);
    expect(decodeTextBytes(utf8)).toBe(header);
  });

  it("falls back to Windows-1251 instead of turning Russian into \uFFFD", () => {
    const decoded = decodeTextBytes(cp1251(header));
    expect(decoded).toBe(header);
    expect(decoded).not.toContain("\uFFFD");
  });
});

describe("BrowserFileSystemAdapter.pickTextFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes a cp1251 bank statement", async () => {
    // В jsdom у File нет arrayBuffer(), в браузерах и WebView он есть везде.
    const bytes = cp1251(header);
    const file = { name: "sber.csv", type: "text/csv", arrayBuffer: async () => bytes.buffer };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = realCreate(tag);
      if (tag === "input") {
        Object.defineProperty(element, "files", { value: [file] });
        element.click = () => (element as HTMLInputElement).onchange?.(new Event("change"));
      }
      return element;
    });

    const picked = await new BrowserFileSystemAdapter().pickTextFile();
    expect(picked?.name).toBe("sber.csv");
    expect(picked?.content).toBe(header);
  });
});
