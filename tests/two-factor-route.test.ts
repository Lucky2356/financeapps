import { generateSync } from "otplib";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateTotpSecret } from "@/lib/auth/totp";

// Endpoint tests for 2FA enable/disable with a mocked Prisma + password check.
// The TOTP verification itself is real (otplib), so a generated code must enable.

const findCurrentUser = vi.fn();
const verifyPassword = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ findCurrentUser: () => findCurrentUser() }));
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...a: unknown[]) => verifyPassword(...a)
}));

const prismaMock = vi.hoisted(() => ({ updates: [] as { data: Record<string, unknown> }[] }));
vi.mock("@/lib/prisma", () => ({
  requirePrisma: () => ({
    user: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        prismaMock.updates.push(args);
        return { id: "u1" };
      })
    }
  })
}));

const { POST } = await import("@/app/api/account/2fa/route.web");

afterEach(() => {
  vi.clearAllMocks();
  prismaMock.updates.length = 0;
});

function req(body: unknown) {
  return new NextRequest("http://localhost/api/account/2fa", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

describe("/api/account/2fa", () => {
  it("requires authentication", async () => {
    findCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ action: "setup" }));
    expect(res.status).toBe(401);
  });

  it("enables 2FA when the TOTP code is valid", async () => {
    const secret = generateTotpSecret();
    findCurrentUser.mockResolvedValue({
      id: "u1",
      twoFactorSecret: secret,
      twoFactorEnabled: false
    });
    const code = generateSync({ secret });
    const res = await POST(req({ action: "enable", code }));
    expect(res.status).toBe(200);
    expect(prismaMock.updates.at(-1)?.data).toEqual({ twoFactorEnabled: true });
  });

  it("rejects enabling with a wrong code", async () => {
    const secret = generateTotpSecret();
    findCurrentUser.mockResolvedValue({
      id: "u1",
      twoFactorSecret: secret,
      twoFactorEnabled: false
    });
    const res = await POST(req({ action: "enable", code: "000000" }));
    expect(res.status).toBe(400);
    expect(prismaMock.updates).toHaveLength(0);
  });

  it("disables 2FA and clears the secret when the password is correct", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1", passwordHash: "hash", twoFactorEnabled: true });
    verifyPassword.mockResolvedValue(true);
    const res = await POST(req({ action: "disable", password: "pw" }));
    expect(res.status).toBe(200);
    expect(prismaMock.updates.at(-1)?.data).toEqual({
      twoFactorEnabled: false,
      twoFactorSecret: null
    });
  });

  it("rejects disabling with a wrong password", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1", passwordHash: "hash", twoFactorEnabled: true });
    verifyPassword.mockResolvedValue(false);
    const res = await POST(req({ action: "disable", password: "wrong" }));
    expect(res.status).toBe(400);
    expect(prismaMock.updates).toHaveLength(0);
  });
});
