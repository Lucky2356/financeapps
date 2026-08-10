// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiClient } from "@/lib/api/ApiClient";
import { NotifyingApiClient } from "@/lib/api/client";
import { onDataChanged } from "@/lib/api/data-events";

// Screens read their numbers once, on mount. In a static export a mutation
// cannot re-render them from the server — the server shell is empty and the
// real figures live in IndexedDB. So a write has to announce itself, or the
// totals and charts already on screen keep showing the state from before it.
// This is the contract that makes that work; forgetting it is silent, which is
// exactly why it is tested rather than trusted.
function stubClient(): ApiClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ id: "1" }),
    put: vi.fn().mockResolvedValue({ id: "1" }),
    delete: vi.fn().mockResolvedValue({ ok: true })
  } as unknown as ApiClient;
}

let unsubscribe: (() => void) | null = null;

function countEvents(): () => number {
  let count = 0;
  unsubscribe = onDataChanged(() => {
    count += 1;
  });
  return () => count;
}

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
});

describe("api change notifications", () => {
  it("announces every write", async () => {
    const client = new NotifyingApiClient(stubClient());
    const events = countEvents();

    await client.post("/transactions", { amount: 1 });
    await client.put("/transactions", { id: "1" });
    await client.delete("/transactions?id=1");

    expect(events()).toBe(3);
  });

  it("stays quiet on reads, so a reload cannot trigger another reload", async () => {
    const client = new NotifyingApiClient(stubClient());
    const events = countEvents();

    await client.get("/dashboard");
    await client.get("/transactions");

    expect(events()).toBe(0);
  });

  it("passes the inner client's answer through untouched", async () => {
    const inner = stubClient();
    const client = new NotifyingApiClient(inner);

    await expect(client.post("/transactions", { amount: 1 })).resolves.toEqual({ id: "1" });
    expect(inner.post).toHaveBeenCalledWith("/transactions", { amount: 1 }, undefined);
  });

  it("does not announce a write that failed", async () => {
    const inner = stubClient();
    (inner.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
    const client = new NotifyingApiClient(inner);
    const events = countEvents();

    await expect(client.post("/transactions", {})).rejects.toThrow("nope");

    expect(events()).toBe(0);
  });
});
