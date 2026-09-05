import { describe, expect, it } from "vitest";

import { legendColumns } from "@/lib/charts/legend";

// The legend under the category ring is a ranking, and a ranking has to read
// down a column. A two-column CSS grid fills across instead: the second-largest
// category landed at the top of the RIGHT column and the third under the first,
// so neither column was ordered and the eye had to zig-zag to find the next
// amount down.
describe("legendColumns", () => {
  it("fills the left column top-down before starting the right one", () => {
    expect(legendColumns(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("gives the odd item to the left column, never the right", () => {
    expect(legendColumns(["a", "b", "c", "d", "e"])).toEqual([
      ["a", "b", "c"],
      ["d", "e"]
    ]);
  });

  it("keeps a single item in one column rather than opening an empty second", () => {
    expect(legendColumns(["a"])).toEqual([["a"]]);
  });

  it("has nothing to lay out for an empty list", () => {
    expect(legendColumns([])).toEqual([[]]);
  });

  // Reading the columns back in order must give the original ranking: on a
  // phone the two stacks sit one under the other, and that has to still be one
  // descending run rather than two interleaved halves.
  it("concatenates back into the original order", () => {
    const items = [90, 70, 50, 30, 20, 10];
    expect(legendColumns(items).flat()).toEqual(items);
  });

  it("splits into more than two columns when asked", () => {
    expect(legendColumns(["a", "b", "c", "d", "e"], 3)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });
});
