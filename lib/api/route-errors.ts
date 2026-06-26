import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { reportError } from "@/lib/observability";

type PrismaLikeError = {
  code?: string;
  message?: string;
};

function isPrismaLikeError(error: unknown): error is PrismaLikeError {
  return typeof error === "object" && error !== null && "code" in error;
}

export function apiErrorResponse(error: unknown, fallback = "Request failed") {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues.map((issue) => issue.message).join("; ")
      },
      { status: 400 }
    );
  }

  if (isPrismaLikeError(error)) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
    }

    if (error.code === "P2002") {
      return NextResponse.json({ error: "Такая запись уже существует." }, { status: 409 });
    }
  }

  // Unexpected error (not a validation/known-DB case) — log + report to Sentry,
  // but return only the generic fallback to the client. The raw error.message can
  // leak internals (stack hints, "ECONNREFUSED ...:5432", table/column names), so
  // it must never reach the browser.
  reportError(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
