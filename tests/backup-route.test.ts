import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the auth seam and the heavy service so we test the route's authorization
// and user-scoping wiring in isolation (no DB, no NextAuth).
const findCurrentUser = vi.fn();
const exportForUser = vi.fn();
const restoreForUser = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({
  findCurrentUser: () => findCurrentUser()
}));
vi.mock("@/lib/prisma", () => ({ requirePrisma: () => ({}) }));
vi.mock("@/services/backup/UserBackupService", () => ({
  UserBackupService: class {
    exportForUser = exportForUser;
    restoreForUser = restoreForUser;
  }
}));

const { GET, POST } = await import("@/app/api/backup/route.web");

afterEach(() => {
  vi.clearAllMocks();
});

function req(
  ip: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
) {
  return new NextRequest("http://localhost/api/backup", {
    method: init?.method,
    body: init?.body,
    headers: { "x-forwarded-for": ip, ...(init?.headers ?? {}) }
  });
}

describe("/api/backup authorization", () => {
  it("GET returns 401 when there is no session user", async () => {
    findCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(exportForUser).not.toHaveBeenCalled();
  });

  it("GET exports scoped to the session user's id (never the first user)", async () => {
    findCurrentUser.mockResolvedValue({ id: "user-alice" });
    exportForUser.mockResolvedValue({ schemaVersion: 1 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(exportForUser).toHaveBeenCalledWith("user-alice");
  });

  it("POST returns 401 when there is no session user", async () => {
    findCurrentUser.mockResolvedValue(null);
    const res = await POST(
      req("10.0.0.3", { method: "POST", body: JSON.stringify({ backup: {} }) })
    );
    expect(res.status).toBe(401);
    expect(restoreForUser).not.toHaveBeenCalled();
  });

  it("POST restores scoped to the session user's id", async () => {
    findCurrentUser.mockResolvedValue({ id: "user-bob" });
    restoreForUser.mockResolvedValue({ restored: true });
    const res = await POST(
      req("10.0.0.4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backup: { schemaVersion: 1 } })
      })
    );
    expect(res.status).toBe(200);
    expect(restoreForUser).toHaveBeenCalledWith("user-bob", { schemaVersion: 1 });
  });
});
