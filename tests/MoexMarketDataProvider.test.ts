import { describe, expect, it } from "vitest";

// Test MOEX row parser independently
function parseMoexRows(table: { columns: string[]; data: (string | number | null)[][] }): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of table.data) {
    const obj: Record<string, unknown> = {};
    table.columns.forEach((col, i) => { obj[col] = row[i] ?? null; });
    const secid = String(obj["SECID"] ?? "");
    if (secid) map.set(secid, obj);
  }
  return map;
}

describe("MOEX ISS response parsing", () => {
  it("parses securities columns correctly", () => {
    const table = {
      columns: ["SECID", "SHORTNAME"],
      data: [["SBER", "Сбербанк"], ["GAZP", "Газпром"]]
    };
    const result = parseMoexRows(table);
    expect(result.get("SBER")).toMatchObject({ SECID: "SBER", SHORTNAME: "Сбербанк" });
    expect(result.get("GAZP")?.SHORTNAME).toBe("Газпром");
  });

  it("handles missing columns gracefully", () => {
    const table = {
      columns: ["SECID", "LAST", "CHANGE"],
      data: [["SBER", null, null], ["LKOH", 7420.5, 0.8]]
    };
    const result = parseMoexRows(table);
    expect(result.get("SBER")?.LAST).toBeNull();
    expect(result.get("LKOH")?.LAST).toBe(7420.5);
  });

  it("handles empty data array", () => {
    const table = { columns: ["SECID", "LAST"], data: [] };
    const result = parseMoexRows(table);
    expect(result.size).toBe(0);
  });
});

describe("MockMarketDataProvider (fallback behavior)", () => {
  it("getSecurities returns 10 securities", async () => {
    const { MockMarketDataProvider } = await import("@/services/market/MockMarketDataProvider");
    const provider = new MockMarketDataProvider();
    const securities = await provider.getSecurities();
    expect(securities).toHaveLength(10);
    expect(securities.every((s) => s.price > 0)).toBe(true);
    expect(securities.every((s) => s.ticker.length > 0)).toBe(true);
  });
});
