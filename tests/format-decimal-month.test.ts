import { describe, expect, it } from "vitest";

import { axisMonth, tooltipMonth } from "@/lib/charts/format";
import { formatDecimal } from "@/lib/format";

describe("дроби и месяцы на языке экрана", () => {
  it("по-русски — запятая, по-английски — точка", () => {
    expect(formatDecimal(35.44, 1, "ru")).toBe("35,4");
    expect(formatDecimal(35.44, 1, "en")).toBe("35.4");
    expect(formatDecimal(3.8, 1, "ru")).toBe("3,8");
    // Минус ноль после округления — просто ноль.
    expect(formatDecimal(-0.01, 1, "ru")).toBe("0,0");
  });

  it("ключ месяца на оси — словом, а не «2026-10»", () => {
    expect(axisMonth("2026-10", "ru")).toMatch(/^окт/);
    expect(axisMonth("2026-10", "en")).toMatch(/^Oct/);
    expect(tooltipMonth("2026-10", "ru")).toMatch(/октябрь 2026/);
    // Не ключ месяца — как есть.
    expect(axisMonth("Окт", "ru")).toBe("Окт");
  });
});
