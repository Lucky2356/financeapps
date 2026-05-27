import { Suspense, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ToastListener } from "@/components/toast-listener";
import { MobileBottomNav, MobileTopBar } from "@/components/mobile-navigation";

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 md:flex">
      <AppSidebar />
      <MobileTopBar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 md:pb-6 lg:px-8">{children}</div>
      </main>
      <MobileBottomNav />
      <Suspense fallback={null}>
        <ToastListener />
      </Suspense>
    </div>
  );
}
