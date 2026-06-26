import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/route-errors";

async function readBody(response: Response) {
  return (await response.json()) as { error?: string };
}

function makeZodError() {
  const result = z.object({ name: z.string() }).safeParse({});
  if (result.success) throw new Error("expected schema to fail");
  return result.error;
}

describe("apiErrorResponse", () => {
  it("maps ZodError to 400 with joined issue messages", async () => {
    const error = z
      .object({
        name: z.string().min(2, "Слишком коротко"),
        age: z.number({ message: "Возраст обязателен" })
      })
      .safeParse({ name: "", age: "x" });

    expect(error.success).toBe(false);
    const response = apiErrorResponse((error as { error: z.ZodError }).error);

    expect(response.status).toBe(400);
    const body = await readBody(response);
    expect(body.error).toContain("Слишком коротко");
    expect(body.error).toContain(";");
  });

  it("maps Prisma P2025 (not found) to 404", async () => {
    const response = apiErrorResponse({ code: "P2025", message: "missing" });
    expect(response.status).toBe(404);
    const body = await readBody(response);
    expect(body.error).toBe("Запись не найдена.");
  });

  it("maps Prisma P2002 (unique constraint) to 409", async () => {
    const response = apiErrorResponse({ code: "P2002", message: "dup" });
    expect(response.status).toBe(409);
    const body = await readBody(response);
    expect(body.error).toBe("Такая запись уже существует.");
  });

  it("hides a generic Error message behind the fallback with status 500", async () => {
    // Security: the raw error.message must never reach the client (it can leak
    // internals like "ECONNREFUSED ...:5432"). Only the generic fallback is returned.
    const response = apiErrorResponse(new Error("Boom"));
    expect(response.status).toBe(500);
    const body = await readBody(response);
    expect(body.error).toBe("Request failed");
    expect(body.error).not.toContain("Boom");
  });

  it("uses the provided fallback message for non-Error values", async () => {
    const response = apiErrorResponse("nope", "Custom fallback");
    expect(response.status).toBe(500);
    const body = await readBody(response);
    expect(body.error).toBe("Custom fallback");
  });

  it("treats an unknown Prisma code as a generic 500", async () => {
    const response = apiErrorResponse({ code: "P9999", message: "weird" });
    expect(response.status).toBe(500);
    const body = await readBody(response);
    // Unknown code falls through to the generic handler; raw message is not leaked.
    expect(body.error).toBe("Request failed");
  });

  it("accepts a ZodError produced from a real failed parse", async () => {
    const response = apiErrorResponse(makeZodError());
    expect(response.status).toBe(400);
  });
});
