"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { isPublicPath } from "@/lib/public-paths";

// Client-side guard for the web app (plan P0). Redirects unauthenticated users
// to /login (except on the public auth pages). Data isolation is already
// enforced server-side by the API; this is the UX layer. Rendered only in the
// web build (see Providers), never in the desktop export.

export function SessionGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (status === "unauthenticated" && !isPublic) {
      router.replace("/login");
    }
  }, [status, isPublic, router]);

  if (status === "unauthenticated" && !isPublic) return null;
  return <>{children}</>;
}
