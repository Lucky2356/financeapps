import { generateSync } from "otplib";
import { describe, expect, it } from "vitest";

import { generateTotpSecret, totpKeyUri, verifyTotp } from "@/lib/auth/totp";

describe("TOTP helpers", () => {
  it("generates a secret and verifies a current token round-trip", () => {
    const secret = generateTotpSecret();
    const token = generateSync({ secret });
    expect(verifyTotp(token, secret)).toBe(true);
  });

  it("tolerates spaces in the entered code", () => {
    const secret = generateTotpSecret();
    const token = generateSync({ secret });
    const spaced = `${token.slice(0, 3)} ${token.slice(3)}`;
    expect(verifyTotp(spaced, secret)).toBe(true);
  });

  it("rejects a wrong code and missing inputs", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp("000000", secret)).toBe(false);
    expect(verifyTotp("", secret)).toBe(false);
    expect(verifyTotp("123456", "")).toBe(false);
  });

  it("builds an otpauth URI carrying the issuer and account", () => {
    const uri = totpKeyUri("user@example.com", generateTotpSecret());
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("issuer=Financial%20Assistant");
    expect(uri).toContain("user%40example.com");
  });
});
