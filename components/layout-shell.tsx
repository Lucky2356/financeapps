import { Suspense, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { HubTabs } from "@/components/hub-tabs";
import { ChromeGate } from "@/components/layout/chrome-gate";
import { SkipLink } from "@/components/layout/skip-link";
import { ToastListener } from "@/components/toast-listener";
import { MobileBottomNav, MobileTopBar } from "@/components/mobile-navigation";
import { QuickAddFab } from "@/components/quick-add-fab";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { getImportPageData } from "@/lib/data";

export async function LayoutShell({ children }: { children: ReactNode }) {
  const importData = await getImportPageData();

  return (
    <div className="min-h-screen bg-muted/30 md:flex">
      {/* Skip navigation for keyboard users */}
      <SkipLink />
      <ChromeGate>
        <AppSidebar />
        <MobileTopBar />
      </ChromeGate>
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1760px] px-4 pb-24 pt-5 sm:px-6 md:pb-6 lg:px-8 2xl:px-12">
          <HubTabs />
          {children}
        </div>
      </main>
      <ChromeGate>
        <MobileBottomNav />
        <QuickAddFab accounts={importData.accounts} categories={importData.categories} />
      </ChromeGate>
      <KeyboardShortcuts />
      <Suspense fallback={null}>
        <ToastListener />
      </Suspense>
    </div>
  );
}
