import { describe, expect, it } from "vitest";

import { MARKET_SECTORS, hasKnownSector, sectorForTicker } from "@/lib/market/sectors";

// The sector chart used to show "Фонды / Облигации / Прочее" — the same split
// as the chart next to it, because the industry was guessed from the kind of
// instrument. These pin down the difference between knowing an industry and
// admitting there is none.
describe("sectorForTicker", () => {
  it("names the industry of a liquid share", () => {
    expect(sectorForTicker("BELU")).toBe("Продовольствие");
    expect(sectorForTicker("ETLN")).toBe("Строительство");
    expect(sectorForTicker("SBER")).toBe("Финансы и Банки");
    expect(sectorForTicker("GAZP")).toBe("Нефть/Газ");
  });

  it("does not care about case or stray spaces", () => {
    expect(sectorForTicker(" belu ")).toBe("Продовольствие");
  });

  it("keeps a bond and a fund as themselves rather than inventing an industry", () => {
    expect(sectorForTicker("RU000A109098", "BOND")).toBe("Облигации");
    expect(sectorForTicker("EQMX", "FUND")).toBe("Фонды");
    expect(sectorForTicker("GLDRUB_TOM", "GOLD")).toBe("Драгоценные металлы");
  });

  it("says «Разное» for a share it has never heard of", () => {
    expect(sectorForTicker("ZZZZ")).toBe("Разное");
    expect(hasKnownSector("ZZZZ")).toBe(false);
    expect(hasKnownSector("SBER")).toBe(true);
  });

  it("only ever answers with a sector the picker offers", () => {
    const offered = new Set<string>(MARKET_SECTORS);
    for (const ticker of ["SBER", "GAZP", "BELU", "ETLN", "MOEX", "YDEX", "ZZZZ"]) {
      expect(offered.has(sectorForTicker(ticker)), ticker).toBe(true);
    }
  });
});
