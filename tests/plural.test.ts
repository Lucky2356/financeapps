import { describe, expect, it } from "vitest";

import { countLabel, plural } from "@/lib/i18n/plural";

const rows = { one: "строка", few: "строки", many: "строк" };
const rowsEn = { one: "row", many: "rows" };

describe("склонение при числе", () => {
  it("русский: три формы по последним цифрам", () => {
    expect(plural(1, rows)).toBe("строка");
    expect(plural(21, rows)).toBe("строка");
    expect(plural(2, rows)).toBe("строки");
    expect(plural(24, rows)).toBe("строки");
    expect(plural(5, rows)).toBe("строк");
    expect(plural(11, rows)).toBe("строк");
    expect(plural(14, rows)).toBe("строк");
    expect(plural(0, rows)).toBe("строк");
    expect(plural(1.5, rows)).toBe("строки");
  });

  it("английский: две формы", () => {
    expect(plural(1, rowsEn, "en")).toBe("row");
    expect(plural(2, rowsEn, "en")).toBe("rows");
    expect(plural(0, rowsEn, "en")).toBe("rows");
  });

  it("число со словом", () => {
    expect(countLabel(21, rows)).toBe("21 строка");
    expect(countLabel(1000, rows)).toBe(`${(1000).toLocaleString("ru")} строк`);
    expect(countLabel(3, rowsEn, "en")).toBe("3 rows");
  });
});
