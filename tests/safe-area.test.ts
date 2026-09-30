import { describe, expect, it } from "vitest";

import { pickSafeTop, rememberSafeTop } from "@/lib/platform/safe-area";

describe("отступ под строкой состояния", () => {
  it("свежий замер главнее запомненного", () => {
    expect(pickSafeTop(48, 30, true)).toBe(48);
  });

  it("внезапный ноль в портрете — берём запомненное", () => {
    expect(pickSafeTop(0, 48, true)).toBe(48);
  });

  it("боком чужой портретный отступ не подставляется", () => {
    expect(pickSafeTop(0, 48, false)).toBe(0);
  });

  it("мусор вместо числа не ломает отступ", () => {
    expect(pickSafeTop(Number.NaN, Number.NaN, true)).toBe(0);
    expect(pickSafeTop(-5, 0, true)).toBe(0);
  });

  it("запоминается только положительный портретный замер", () => {
    expect(rememberSafeTop(48, 0, true)).toBe(48);
    expect(rememberSafeTop(0, 48, true)).toBe(48);
    expect(rememberSafeTop(30, 48, false)).toBe(48);
  });
});
