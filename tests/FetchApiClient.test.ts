import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchApiClient } from "@/lib/api/FetchApiClient";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

describe("FetchApiClient URL building", () => {
  it("joins base and path with a single slash", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await new FetchApiClient("http://localhost/api").get("/accounts");
    expect(lastCall().url).toBe("http://localhost/api/accounts");
  });

  it("trims a trailing slash on the base url", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await new FetchApiClient("http://localhost/api/").get("/accounts");
    expect(lastCall().url).toBe("http://localhost/api/accounts");
  });

  it("adds a leading slash to a relative path", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await new FetchApiClient("http://localhost/api").get("accounts");
    expect(lastCall().url).toBe("http://localhost/api/accounts");
  });

  it("passes absolute http urls through untouched", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await new FetchApiClient("http://localhost/api").get("http://other/x");
    expect(lastCall().url).toBe("http://other/x");
  });
});

describe("FetchApiClient verbs", () => {
  it("sends GET with the json content-type header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ value: 1 }));
    const result = await new FetchApiClient("/api").get<{ value: number }>("/x");
    const { init } = lastCall();
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(result).toEqual({ value: 1 });
  });

  it("serializes the POST body to JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1" }));
    await new FetchApiClient("/api").post("/x", { name: "test" });
    const { init } = lastCall();
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "test" }));
  });

  it("omits the body when POST is called without one", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1" }));
    await new FetchApiClient("/api").post("/x");
    expect(lastCall().init.body).toBeUndefined();
  });

  it("serializes the PUT body and uses the PUT method", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1" }));
    await new FetchApiClient("/api").put("/x", { a: 1 });
    const { init } = lastCall();
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("uses the DELETE method", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await new FetchApiClient("/api").delete("/x");
    expect(lastCall().init.method).toBe("DELETE");
  });

  it("merges caller-provided headers over the defaults", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await new FetchApiClient("/api").get("/x", { headers: { authorization: "Bearer t" } });
    const headers = lastCall().init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer t");
    expect(headers["content-type"]).toBe("application/json");
  });
});

describe("FetchApiClient responses", () => {
  it("returns undefined for a 204 No Content response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await new FetchApiClient("/api").delete("/x");
    expect(result).toBeUndefined();
  });

  it("throws the error field from a JSON error body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Запись не найдена." }, 404));
    await expect(new FetchApiClient("/api").get("/x")).rejects.toThrow("Запись не найдена.");
  });

  it("throws the raw text when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    await expect(new FetchApiClient("/api").get("/x")).rejects.toThrow("Internal Server Error");
  });

  it("falls back to a status message when the error body is empty", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    await expect(new FetchApiClient("/api").get("/x")).rejects.toThrow("API request failed: 503");
  });
});
