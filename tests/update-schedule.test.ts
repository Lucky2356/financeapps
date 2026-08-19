// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  markAnnounced as androidMarkAnnounced,
  markChecked as androidMarkChecked,
  shouldCheckNow as androidShouldCheckNow
} from "@/lib/updates/android";
import { markAnnounced, markChecked, shouldAnnounce, shouldCheckNow } from "@/lib/updates/schedule";

// The same gate now serves both builds: the phone reads the release manifest
// itself, the PC asks the Tauri updater, and each keeps its own answer to "have
// I looked lately". The PC had no gate at all until 1.11.1 — nothing asked for
// it in the background, so a desktop sat two releases behind while the phone
// kept itself current.
describe("update gate", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("checks on a fresh install, on either platform", () => {
    expect(shouldCheckNow("desktop")).toBe(true);
    expect(shouldCheckNow("android")).toBe(true);
  });

  it("waits six hours between checks", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    markChecked("desktop", now);

    expect(shouldCheckNow("desktop", new Date(now.getTime() + 4 * 60 * 60 * 1000))).toBe(false);
    expect(shouldCheckNow("desktop", new Date(now.getTime() + 7 * 60 * 60 * 1000))).toBe(true);
  });

  it("keeps the two platforms apart", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    markChecked("desktop", now);
    // A check on this machine says nothing about the phone's schedule.
    expect(shouldCheckNow("android", now)).toBe(true);

    markAnnounced("desktop", "1.11.1");
    expect(shouldAnnounce("desktop", "1.11.1")).toBe(false);
    expect(shouldAnnounce("android", "1.11.1")).toBe(true);
  });

  it("announces a version once, then stays quiet about it", () => {
    expect(shouldAnnounce("desktop", "1.11.1")).toBe(true);
    markAnnounced("desktop", "1.11.1");
    expect(shouldAnnounce("desktop", "1.11.1")).toBe(false);
    // A newer release speaks up again.
    expect(shouldAnnounce("desktop", "1.12.0")).toBe(true);
  });

  it("leaves the phone's storage keys where they were", () => {
    // Renaming them would make every installed phone think it had never
    // checked — and announce the version it is already running.
    const now = new Date("2026-08-19T12:00:00Z");
    androidMarkChecked(now);
    expect(localStorage.getItem("android-update-last-check")).toBe(String(now.getTime()));
    expect(androidShouldCheckNow(new Date(now.getTime() + 60_000))).toBe(false);

    androidMarkAnnounced("1.11.1");
    expect(localStorage.getItem("android-update-notified-version")).toBe("1.11.1");
  });
});
