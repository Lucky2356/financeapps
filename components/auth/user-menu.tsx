"use client";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";

// Small floating account control for the web app — current email + sign-out.
// Rendered only in the web build (see Providers).
export function UserMenu() {
  const { data: session, status } = useSession();
  if (status !== "authenticated") return null;

  return (
    <div className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1 text-xs shadow-sm backdrop-blur">
      <span className="max-w-[160px] truncate text-muted-foreground">{session.user?.email}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="size-3.5" />
        Выйти
      </Button>
    </div>
  );
}
