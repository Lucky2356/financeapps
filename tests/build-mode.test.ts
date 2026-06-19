import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadBuildMode() {
  const mod = await import("@/lib/build-mode");
  return mod;
}

describe("build-mode helpers", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses build fallback data for static exports", async () => {
    process.env.NEXT_OUTPUT = "export";
    process.env.npm_lifecycle_event = "";

    const { shouldUseBuildFallbackData } = await loadBuildMode();

    expect(shouldUseBuildFallbackData()).toBe(true);
  });

  it("uses build fallback data during web production builds", async () => {
    process.env.NEXT_OUTPUT = "";
    process.env.npm_lifecycle_event = "build";

    const { shouldUseBuildFallbackData } = await loadBuildMode();

    expect(shouldUseBuildFallbackData()).toBe(true);
  });

  it("keeps runtime web requests on the live data path", async () => {
    process.env.NEXT_OUTPUT = "";
    process.env.npm_lifecycle_event = "start";
    delete process.env.NEXT_BUILD_SKIP_DB;

    const { shouldUseBuildFallbackData } = await loadBuildMode();

    expect(shouldUseBuildFallbackData()).toBe(false);
  });
});
