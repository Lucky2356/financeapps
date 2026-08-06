// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { markAnnounced, markChecked, shouldAnnounce, shouldCheckNow } from "@/lib/updates/android";

// The gate that decides how soon a phone learns about a new release. It used to
// be "once a day, marked before the request", which meant a release published
// after the morning check stayed invisible until the next day — and a failed
// request burned the same day. What must stay throttled is the notice, not the
// question.
describe("android update gate", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("checks on a fresh install", () => {
    expect(shouldCheckNow()).toBe(true);
  });

  it("waits six hours between checks, not a day", () => {
    const now = new Date("2026-08-06T12:00:00Z");
    markChecked(now);

    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    expect(shouldCheckNow(fourHoursLater)).toBe(false);

    const sevenHoursLater = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    expect(shouldCheckNow(sevenHoursLater)).toBe(true);
  });

  it("announces a version once, then stays quiet about it", () => {
    expect(shouldAnnounce("1.7.0")).toBe(true);
    markAnnounced("1.7.0");
    expect(shouldAnnounce("1.7.0")).toBe(false);
    // A newer release speaks up again.
    expect(shouldAnnounce("1.8.0")).toBe(true);
  });
});
