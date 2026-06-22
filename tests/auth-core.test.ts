import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { DEFAULT_NEW_USER_CATEGORIES } from "@/lib/auth/provisioning";

describe("password hashing (plan P0)", () => {
  it("hashes then verifies the correct password", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(hash).not.toBe("s3cret-pass");
    expect(await verifyPassword("s3cret-pass", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("salts — same input yields distinct hashes", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});

describe("default new-user categories (plan P0)", () => {
  it("has income and expense entries with unique name+kind keys", () => {
    expect(DEFAULT_NEW_USER_CATEGORIES.length).toBeGreaterThan(0);
    const keys = DEFAULT_NEW_USER_CATEGORIES.map((c) => `${c.kind}:${c.name}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEFAULT_NEW_USER_CATEGORIES.some((c) => c.kind === "INCOME")).toBe(true);
    expect(DEFAULT_NEW_USER_CATEGORIES.some((c) => c.kind === "EXPENSE")).toBe(true);
  });
});
