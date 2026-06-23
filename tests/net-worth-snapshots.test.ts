import { describe, expect, it } from "vitest";

import { buildNetWorthTrend } from "@/lib/net-worth";
import { isoDay, recordSnapshot, snapshotAsOf } from "@/lib/net-worth-snapshots";

describe("net-worth snapshots (plan B7)", () => {
  it("isoDay formats local YYYY-MM-DD", () => {
    expect(isoDay(new Date(2026, 5, 9))).toBe("2026-06-09");
  });

  describe("recordSnapshot", () => {
    it("appends a new day and keeps the list sorted", () => {
      let snaps = recordSnapshot([], "2026-06-10", 100);
      snaps = recordSnapshot(snaps, "2026-06-09", 90);
      expect(snaps.map((s) => s.date)).toEqual(["2026-06-09", "2026-06-10"]);
    });

    it("replaces the same day's value (net worth changed during the day)", () => {
      let snaps = recordSnapshot([], "2026-06-10", 100);
      snaps = recordSnapshot(snaps, "2026-06-10", 250);
      expect(snaps).toEqual([{ date: "2026-06-10", value: 250 }]);
    });

    it("caps history to maxEntries (keeps the most recent)", () => {
      let snaps: { date: string; value: number }[] = [];
      for (let d = 1; d <= 5; d++) snaps = recordSnapshot(snaps, `2026-06-0${d}`, d, 3);
      expect(snaps.map((s) => s.date)).toEqual(["2026-06-03", "2026-06-04", "2026-06-05"]);
    });
  });

  describe("snapshotAsOf", () => {
    const snaps = [
      { date: "2026-04-30", value: 10 },
      { date: "2026-05-31", value: 20 }
    ];
    it("returns the latest snapshot on or before the date", () => {
      expect(snapshotAsOf(snaps, "2026-06-15")?.value).toBe(20);
      expect(snapshotAsOf(snaps, "2026-05-15")?.value).toBe(10);
    });
    it("returns null when nothing is on or before the date", () => {
      expect(snapshotAsOf(snaps, "2026-01-01")).toBeNull();
    });
  });

  describe("buildNetWorthTrend with snapshots", () => {
    it("uses snapshot value for covered months, reconstruction for earlier ones", () => {
      const now = new Date(2026, 5, 15); // 15 Jun 2026
      const trend = buildNetWorthTrend({
        currentNetWorth: 70000,
        transactions: [], // no flows → reconstruction = currentNetWorth
        snapshots: [{ date: "2026-05-31", value: 50000 }],
        now
      });
      // Six buckets: Jan..Jun. Early months (no snapshot) → reconstruction (70000);
      // May (snapshot) and June (carried-forward latest) → 50000.
      expect(trend).toHaveLength(6);
      expect(trend[0].value).toBe(70000);
      expect(trend[4].value).toBe(50000);
      expect(trend[5].value).toBe(50000);
    });
  });
});
