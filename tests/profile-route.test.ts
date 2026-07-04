import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Endpoint tests for the account profile route (view + rename) with a mocked
// Prisma + current-user. Rate limiting is real but well under its per-minute cap.

const findCurrentUser = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ findCurrentUser: () => findCurrentUser() }));

const prismaMock = vi.hoisted(() => ({ updates: [] as { data: Record<string, unknown> }[] }));
vi.mock("@/lib/prisma", () => ({
  requirePrisma: () => ({
    user: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        prismaMock.updates.push(args);
        return { name: String(args.data.name), email: "a@b.com", createdAt: new Date(0) };
      })
    }
  })
}));

const { GET, PUT } = await import("@/app/api/account/profile/route.web");

afterEach(() => {
  vi.clearAllMocks();
  prismaMock.updates.length = 0;
});

function put(body: unknown) {
  return new NextRequest("http://localhost/api/account/profile", {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

describe("/api/account/profile", () => {
  it("returns 401 for GET when unauthenticated", async () => {
    findCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the profile for an authenticated user", async () => {
    findCurrentUser.mockResolvedValue({
      id: "u1",
      name: "Иван",
      email: "ivan@example.com",
      createdAt: new Date("2026-01-02T00:00:00Z")
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Иван", email: "ivan@example.com" });
  });

  it("updates and trims the display name", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const res = await PUT(put({ name: "  Новое имя  " }));
    expect(res.status).toBe(200);
    expect(prismaMock.updates.at(-1)?.data).toEqual({ name: "Новое имя" });
  });

  it("rejects an empty name", async () => {
    findCurrentUser.mockResolvedValue({ id: "u1" });
    const res = await PUT(put({ name: "   " }));
    expect(res.status).toBe(400);
    expect(prismaMock.updates).toHaveLength(0);
  });

  it("returns 401 for PUT when unauthenticated", async () => {
    findCurrentUser.mockResolvedValue(null);
    const res = await PUT(put({ name: "X" }));
    expect(res.status).toBe(401);
    expect(prismaMock.updates).toHaveLength(0);
  });
});
