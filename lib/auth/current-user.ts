import { runtimeConfig } from "@/lib/platform/env";
import { requirePrisma } from "@/lib/prisma";

// Single seam for resolving "who is the current user" on the web (server) path.
//
// - Desktop static export: never serves /api at runtime and must not call
//   cookies() during prerender, so it resolves the single local account.
// - Web: resolves the authenticated session user (NextAuth). All API routes and
//   lib/data.ts go through here, so isolation is enforced in one place.
//
// auth() is imported lazily so next-auth is not pulled into the static export
// bundle and cookies() is never touched in export mode.
export async function findCurrentUser() {
  if (runtimeConfig.isStaticExport) {
    return requirePrisma().user.findFirst({ orderBy: { createdAt: "asc" } });
  }
  const { auth } = await import("@/auth");
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return requirePrisma().user.findUnique({ where: { id } });
}
