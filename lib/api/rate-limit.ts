import { NextResponse } from "next/server";

// Lightweight in-memory fixed-window rate limiter (plan P0). Single-instance
// only — state lives in process memory and resets on restart. Good enough for a
// single-node beta; for multi-instance scale (P2) swap the store for Redis/Upstash
// keeping this same interface.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = { ok: boolean; retryAfter: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic prune so the map can't grow unbounded across unique keys.
  if (windows.size > 10_000) {
    for (const [k, w] of windows) {
      if (now >= w.resetAt) windows.delete(k);
    }
  }

  const existing = windows.get(key);
  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

// Best-effort client IP from common proxy headers (P0 beta). Behind a trusted
// reverse proxy this is the real client; tighten per-host at deploy time.
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: "Слишком много запросов. Попробуйте позже." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
