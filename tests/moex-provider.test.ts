import { afterEach, describe, expect, it, vi } from "vitest";

const securitiesJson = {
  securities: { columns: ["SECID", "SHORTNAME"], data: [["SBER", "Сбербанк"]] },
  marketdata: {
    columns: ["SECID", "LAST", "LASTTOPREVPRICE", "MARKETPRICE"],
    data: [["SBER", 320, 1.5, 319]]
  }
};
const historyJson = {
  history: {
    columns: ["TRADEDATE", "CLOSE"],
    data: [
      ["2026-05-01", 300],
      ["2026-05-31", 330]
    ]
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules(); // fresh module-level caches per test
});

describe("MoexMarketDataProvider", () => {
  it("parses live price, day change (LASTTOPREVPRICE) and 30d change from history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).includes("/history/") ? historyJson : securitiesJson;
        return { ok: true, json: async () => body } as Response;
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const securities = await new MoexMarketDataProvider().getSecurities();
    const sber = securities.find((s) => s.ticker === "SBER");
    expect(sber).toBeDefined();
    expect(sber?.price).toBe(320);
    expect(sber?.changeDay).toBe(1.5);
    expect(sber?.change30d).toBe(10); // (330 - 300) / 300 * 100
  });

  it("uses the official last close (not the weighted-average market price) when the market is closed", async () => {
    // Market closed: MOEX zeroes LAST/LCURRENTPRICE and only MARKETPRICE (a
    // weighted average, here 319) remains. The shown price must be the last
    // history CLOSE (330) — the per-share price a broker shows — not 319.
    const closedJson = {
      securities: { columns: ["SECID", "SHORTNAME"], data: [["SBER", "Сбербанк"]] },
      marketdata: {
        columns: [
          "SECID",
          "LAST",
          "LCURRENTPRICE",
          "LASTTOPREVPRICE",
          "MARKETPRICE",
          "TRADINGSTATUS"
        ],
        data: [["SBER", null, null, 0, 319, "N"]]
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).includes("/history/") ? historyJson : closedJson;
        return { ok: true, json: async () => body } as Response;
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const sber = (await new MoexMarketDataProvider().getSecurities()).find(
      (s) => s.ticker === "SBER"
    );
    expect(sber?.price).toBe(330); // last CLOSE, not 319 (MARKETPRICE)
    expect(sber?.changeDay).toBe(10); // close-over-close (330 vs 300), not 0
  });

  it("falls back to mock data when MOEX is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const securities = await new MoexMarketDataProvider().getSecurities();
    expect(securities.length).toBeGreaterThan(0); // mock universe
    expect(securities.some((s) => s.ticker === "SBER")).toBe(true);
  });
});

// Boards other than shares: a bond is quoted as a percentage of its face value,
// a fund shares the shares board with actual shares, and the metals board is
// taken two instruments at a time. None of this was reachable before — the app
// looked at exactly one board, so a bond simply could not be found.
describe("MoexMarketDataProvider across boards", () => {
  const sharesJson = {
    securities: {
      columns: ["SECID", "SHORTNAME", "SECTYPE"],
      data: [
        ["SBER", "Сбербанк", "1"],
        ["LQDT", "LQDT ETF", "J"]
      ]
    },
    marketdata: {
      columns: ["SECID", "LAST", "LCURRENTPRICE", "LASTTOPREVPRICE", "MARKETPRICE"],
      data: [
        ["SBER", 320, null, 1.5, 319],
        ["LQDT", 1.72, null, 0.02, 1.71]
      ]
    }
  };
  const bondsJson = {
    securities: {
      columns: ["SECID", "SHORTNAME", "FACEVALUE", "ACCRUEDINT", "FACEUNIT"],
      data: [
        ["SU26238RMFS4", "ОФЗ 26238", 1000, 13.23, "SUR"],
        // Face value in yuan: converting it would need an exchange rate per
        // instrument, so it must not be offered at all.
        ["RU000A10DQA8", "ОФЗ 33 CNY", 10000, 1480.6, "CNY"]
      ]
    },
    marketdata: {
      columns: ["SECID", "LAST", "LCURRENTPRICE", "LASTTOPREVPRICE", "MARKETPRICE"],
      data: [
        ["SU26238RMFS4", 54.36, null, -0.2, 54.3],
        ["RU000A10DQA8", 96.7, null, 0.1, 96.7]
      ]
    }
  };
  const goldJson = {
    securities: {
      columns: ["SECID", "SHORTNAME"],
      data: [
        ["GLDRUB_TOM", "GLDRUB_TOM"],
        ["USDRUB_TOM", "USDRUB_TOM"]
      ]
    },
    marketdata: {
      columns: ["SECID", "LAST", "LASTTOPREVPRICE", "MARKETPRICE"],
      data: [
        ["GLDRUB_TOM", 11452, 0.4, 11450],
        ["USDRUB_TOM", 81.2, 0.1, 81.1]
      ]
    }
  };

  function stubBoards() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const text = String(url);
        const body = text.includes("/history/")
          ? historyJson
          : text.includes("/bonds/")
            ? bondsJson
            : text.includes("CETS")
              ? goldJson
              : sharesJson;
        return { ok: true, json: async () => body } as Response;
      })
    );
  }

  it("prices a bond in roubles: percent of face value plus accrued interest", async () => {
    stubBoards();
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const [bond] = await new MoexMarketDataProvider().searchSecurities("SU26238");
    expect(bond.assetKind).toBe("BOND");
    // 54.36% of 1000 = 543.60, plus 13.23 of accrued interest.
    expect(bond.price).toBe(556.83);
  });

  it("leaves out bonds whose face value is in another currency", async () => {
    stubBoards();
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const matches = await new MoexMarketDataProvider().searchSecurities("ОФЗ");
    expect(matches.map((item) => item.ticker)).not.toContain("RU000A10DQA8");
  });

  it("tells a fund apart from a share on the same board", async () => {
    stubBoards();
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const provider = new MoexMarketDataProvider();
    expect((await provider.searchSecurities("LQDT"))[0].assetKind).toBe("FUND");
    expect((await provider.searchSecurities("SBER"))[0].assetKind).toBe("STOCK");
  });

  it("narrows the search to one kind when asked", async () => {
    stubBoards();
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const provider = new MoexMarketDataProvider();
    const bondsOnly = await provider.searchSecurities("S", 20, "BOND");
    expect(bondsOnly.every((item) => item.assetKind === "BOND")).toBe(true);
    expect(bondsOnly.some((item) => item.ticker === "SBER")).toBe(false);
  });

  it("takes metal from the currency board and not the rest of it", async () => {
    stubBoards();
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const provider = new MoexMarketDataProvider();
    expect((await provider.searchSecurities("GLD"))[0].assetKind).toBe("GOLD");
    expect(await provider.searchSecurities("USDRUB")).toEqual([]);
  });

  it("survives one board being down without losing the others", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const text = String(url);
        if (text.includes("/bonds/")) throw new Error("bond feed down");
        const body = text.includes("/history/") ? historyJson : sharesJson;
        return { ok: true, json: async () => body } as Response;
      })
    );
    const { MoexMarketDataProvider } = await import("@/services/market/MoexMarketDataProvider");
    const matches = await new MoexMarketDataProvider().searchSecurities("SBER");
    expect(matches[0].ticker).toBe("SBER");
  });
});
