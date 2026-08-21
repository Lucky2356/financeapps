import { describe, expect, it } from "vitest";

import {
  activeNavHref,
  DESKTOP_HUBS,
  findHub,
  HUB_GROUPS,
  hubsFor,
  MOBILE_PRIMARY
} from "@/lib/navigation";

describe("the analytics hub", () => {
  it("puts План/факт at the head of the strip on the desktop", () => {
    expect(findHub("/analytics", "desktop")?.tabs[0]?.href).toBe("/plan");
  });

  it("puts it ahead of the other read-only screens on the phone", () => {
    // The phone has no analytics section of its own: the reading screens are
    // folded into the ledger hub, so "first" means first among them.
    const tabs = findHub("/analytics", "mobile")?.tabs.map((tab) => tab.href) ?? [];
    for (const href of ["/analytics", "/forecast", "/reports"]) {
      expect(tabs.indexOf("/plan"), `План/факт before ${href}`).toBeLessThan(tabs.indexOf(href));
    }
  });

  it("still opens Аналитика from the menu button", () => {
    // The landing is deliberately not the first tab here: the owner asked for
    // План/факт first in the strip while the section itself stays where it was.
    expect(activeNavHref("/plan", "desktop")).toBe("/analytics");
    expect(activeNavHref("/analytics", "desktop")).toBe("/analytics");
  });
});

describe("navigation structure", () => {
  it("gives every hub a landing that is one of its own tabs", () => {
    for (const group of [...DESKTOP_HUBS, ...HUB_GROUPS]) {
      expect(group.tabs.some((tab) => tab.href === group.landing)).toBe(true);
    }
  });

  it("never lists the same route in two hubs of one surface", () => {
    for (const surface of ["desktop", "mobile"] as const) {
      const seen = new Set<string>();
      for (const group of hubsFor(surface)) {
        for (const tab of group.tabs) {
          expect(seen.has(tab.href), `${tab.href} twice on ${surface}`).toBe(false);
          seen.add(tab.href);
        }
      }
    }
  });

  it("keeps the phone bar at four destinations — the fifth slot is the add button", () => {
    expect(MOBILE_PRIMARY).toHaveLength(4);
  });
});
