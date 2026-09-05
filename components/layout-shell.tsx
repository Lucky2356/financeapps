import { Suspense, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { HubTabs } from "@/components/hub-tabs";
import { SkipLink } from "@/components/layout/skip-link";
import { ToastListener } from "@/components/toast-listener";
import { MobileBottomNav, MobileTopBar } from "@/components/mobile-navigation";
import { QuickAddFab } from "@/components/quick-add-fab";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { getImportPageData } from "@/lib/data";

export async function LayoutShell({ children }: { children: ReactNode }) {
  const importData = await getImportPageData();

  // Правило про брейкпоинты, одно на всё приложение.
  //
  // Начиная с md боковая панель забирает 272 px, поэтому окно и полоса
  // содержимого — разные величины, и колонки надо выбирать по второй:
  //
  //   окно 767 → 719 px содержимого (панели ещё нет)
  //   окно 768 → 448 px            (панель появилась — минус 38 %)
  //   окно 1024 → 688 px
  //   окно 1280 → 944 px
  //
  // Отсюда два вывода, на которых приложение уже обжигалось.
  // Первое: сетка на три и больше колонок, заведённая от sm: или md:, попадает
  // ровно в ту самую 448-пиксельную яму — четыре колонки по 95 px.
  // Три и больше колонок начинаются с lg:, не раньше.
  // Второе: xl: (1280) в этом приложении почти недостижим. Своё окно
  // открывается шириной 1280, и с полосой прокрутки WebView2 это innerWidth
  // 1265 — на пятнадцать пикселей меньше. Двухколоночные экраны, заведённые от
  // xl:, в штатном окне не включались никогда. Две колонки — от lg:.
  return (
    <div className="min-h-screen bg-muted/30 md:flex">
      {/* Skip navigation for keyboard users */}
      <SkipLink />
      <AppSidebar />
      <MobileTopBar />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
        {/* Bottom padding clears the fixed mobile bar plus the gesture-navigation
            inset, so the last row of any list stays tappable on a phone — and on
            the desktop it clears the floating add button, which used to sit on
            top of the last table row and the pagination under it. */}
        <div className="mx-auto w-full max-w-[1760px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 md:pb-24 lg:px-8 2xl:px-12">
          <HubTabs />
          {children}
        </div>
      </main>
      <MobileBottomNav />
      <QuickAddFab accounts={importData.accounts} categories={importData.categories} />
      <KeyboardShortcuts />
      <Suspense fallback={null}>
        <ToastListener />
      </Suspense>
    </div>
  );
}
