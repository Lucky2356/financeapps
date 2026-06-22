"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

import { isLocalDesktopMode } from "@/lib/platform/env";

// Hides the app chrome (sidebar, mobile nav, FAB) on the web auth pages and for
// unauthenticated visitors, so /login and /register render as a clean standalone
// screen. Desktop (local) has no auth — chrome always shows.
const AUTH_PREFIXES = ["/login", "/register"];

export function ChromeGate({ children }: { children: ReactNode }) {
  if (isLocalDesktopMode) return <>{children}</>;
  return <WebChromeGate>{children}</WebChromeGate>;
}

function WebChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const onAuthPage = AUTH_PREFIXES.some((p) => pathname?.startsWith(p));
  if (onAuthPage || status !== "authenticated") return null;
  return <>{children}</>;
}
