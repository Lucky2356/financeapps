import { requirePrisma } from "@/lib/prisma";

// Single seam for resolving "who is the current user" on the web (server) path.
//
// Today it returns the single default account (the same behaviour the API has
// always had). This is the ONE place to change for P0 multi-tenancy: when
// Auth.js lands, resolve the authenticated session user here instead of the
// first row. Every API route and lib/data.ts go through this function, so the
// auth swap is localized rather than scattered across ~12 routes.
//
// TODO(P0-auth): replace the default-account lookup with the session user id.
export function findCurrentUser() {
  return requirePrisma().user.findFirst({ orderBy: { createdAt: "asc" } });
}
