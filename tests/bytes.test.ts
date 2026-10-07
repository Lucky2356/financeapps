import { afterEach, describe, expect, it } from "vitest";

import { fromBase64, toBase64 } from "@/lib/sync/bytes";

// Base64 шифротекста считается на каждой записи книги — и должен совпадать
// байт в байт с тем, что пишут и читают другие устройства и старые версии.

function reference(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function random(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let start = 0; start < length; start += 65536) {
    crypto.getRandomValues(bytes.subarray(start, Math.min(start + 65536, length)));
  }
  return bytes;
}

describe("base64", () => {
  const proto = Uint8Array.prototype as Uint8Array & { toBase64?: unknown };
  const ctor = Uint8Array as unknown as { fromBase64?: unknown };
  const nativeEncode = proto.toBase64;
  const nativeDecode = ctor.fromBase64;

  afterEach(() => {
    proto.toBase64 = nativeEncode;
    ctor.fromBase64 = nativeDecode;
  });

  it("совпадает с эталоном на любом хвосте — 0, 1 и 2 лишних байта", () => {
    for (let length = 0; length <= 7; length++) {
      const bytes = random(length);
      expect(toBase64(bytes)).toBe(reference(bytes));
      expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
    }
  });

  it("книга в мегабайты — туда и обратно без потерь", () => {
    const bytes = random(3 * 1024 * 1024 + 2);
    const text = toBase64(bytes);
    expect(text).toBe(reference(bytes));
    expect(Buffer.from(fromBase64(text)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("все значения байта", () => {
    const bytes = Uint8Array.from({ length: 256 * 3 }, (_, i) => i % 256);
    expect(toBase64(bytes)).toBe(reference(bytes));
  });

  it("встроенный toBase64/fromBase64 берётся, когда он есть", () => {
    proto.toBase64 = function (this: Uint8Array) {
      return `native:${this.length}`;
    };
    ctor.fromBase64 = () => new Uint8Array([7]);
    expect(toBase64(new Uint8Array(5))).toBe("native:5");
    expect([...fromBase64("AA==")]).toEqual([7]);
  });
});
