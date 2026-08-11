import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { chartTooltipProps } from "@/components/charts/chart-tooltip";

// The explanation that appears on hover is the whole point of a chart: it is
// where the exact figure lives. Letting the box escape the chart's view box put
// it past the right edge of the window on the last month — the column people
// look at most — where the numbers were cut in half. These two checks keep it
// inside and keep every chart on the shared settings.
const ROOT = resolve(__dirname, "..");
const CHART_DIRS = ["components"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx$/.test(entry)) found.push(full);
  }
  return found;
}

describe("chart tooltips", () => {
  it("stays inside the chart instead of running off the window", () => {
    expect(chartTooltipProps.allowEscapeViewBox).toEqual({ x: false, y: false });
  });

  it("is spread on every recharts tooltip", () => {
    const offenders: string[] = [];
    for (const dir of CHART_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const source = readFileSync(file, "utf8");
        if (!source.includes("<Tooltip")) continue;
        if (!source.includes("chartTooltipProps")) offenders.push(file.slice(ROOT.length + 1));
      }
    }

    expect(offenders, "spread {...chartTooltipProps} onto <Tooltip>").toEqual([]);
  });
});
