import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// GUARD: the version has to be the same number in four files, and the release
// tag has to say that number too.
//
// latest.json takes its version from the tag; the app takes its own from
// package.json (next.config.mjs → NEXT_PUBLIC_APP_VERSION). When those two
// disagree the release still publishes green, and then every desktop and every
// phone offers the same update forever — installing it changes nothing, because
// the installed copy still reports the old number. Nothing catches that after
// the fact; only another release with the numbers agreeing.
const SCRIPT = resolve(__dirname, "..", "scripts", "verify-release-version.mjs");
const REPO = resolve(__dirname, "..");

const FILES = [
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock"
];

function run(cwd: string, tag?: string) {
  return execFileSync(process.execPath, tag ? [SCRIPT, tag] : [SCRIPT], {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
}

describe("the repository itself", () => {
  it("spells the same version in all four files", () => {
    expect(() => run(REPO)).not.toThrow();
  });
});

describe("verify-release-version", () => {
  let workspace: string;

  function write(relative: string, contents: string) {
    const target = join(workspace, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  function seed(versions: Partial<Record<(typeof FILES)[number], string>> = {}) {
    const at = (file: string) => versions[file as (typeof FILES)[number]] ?? "1.2.3";
    write("package.json", JSON.stringify({ version: at("package.json") }, null, 2));
    write(
      "src-tauri/tauri.conf.json",
      JSON.stringify({ version: at("src-tauri/tauri.conf.json") }, null, 2)
    );
    write(
      "src-tauri/Cargo.toml",
      `[package]\nname = "financial-assistant"\nversion = "${at("src-tauri/Cargo.toml")}"\n`
    );
    write(
      "src-tauri/Cargo.lock",
      `[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "financial-assistant"\nversion = "${at("src-tauri/Cargo.lock")}"\ndependencies = []\n`
    );
  }

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "release-version-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("accepts files that agree, with and without a tag", () => {
    seed();
    expect(() => run(workspace)).not.toThrow();
    expect(() => run(workspace, "v1.2.3")).not.toThrow();
  });

  // The half-finished bump: this is what a pull request has to trip over,
  // before there is any tag to compare against.
  it.each(FILES)("rejects a bump that left %s behind", (file) => {
    seed({ [file]: "1.2.2" });
    expect(() => run(workspace)).toThrow();
  });

  it("rejects a tag that does not match the files", () => {
    seed();
    expect(() => run(workspace, "v1.3.0")).toThrow();
  });

  it("reads the tag with or without its leading v", () => {
    seed();
    expect(() => run(workspace, "1.2.3")).not.toThrow();
  });

  // Not cosmetic: the four files are read by four different parsers, and a file
  // whose shape changed must fail loudly rather than quietly find nothing.
  it("fails when a file no longer holds a version where it used to", () => {
    seed();
    writeFileSync(
      join(workspace, "src-tauri", "Cargo.toml"),
      `[package]\nname = "financial-assistant"\n`
    );
    expect(() => run(workspace)).toThrow();
  });

  it("names the release trap in the failure, so the log says why it matters", () => {
    seed();
    try {
      run(workspace, "v1.3.0");
      throw new Error("скрипт обязан был упасть");
    } catch (error) {
      const output = `${(error as { stderr?: string }).stderr ?? ""}`;
      expect(output).toContain("тег обещает 1.3.0");
    }
  });
});

describe("the release workflow", () => {
  it("runs the gate before the build, not after it", () => {
    const workflow = readFileSync(resolve(REPO, ".github/workflows/desktop-release.yml"), "utf8");
    const gate = workflow.indexOf("verify-release-version.mjs");
    const build = workflow.indexOf("Build Tauri Windows bundle");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(build);
  });
});
