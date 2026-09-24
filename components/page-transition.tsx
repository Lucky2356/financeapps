"use client";

// Переход между экранами — мягким появлением, а не сменой кадра.
//
// Ключ — адрес: сменился экран — обёртка создаётся заново и проигрывает
// появление. Смена одних лишь параметров (?section=… в настройках) экран не
// перерисовывает: там своё, меньшее движение.
//
// Кто просил систему не двигать ничего, получает экран сразу: общее правило
// prefers-reduced-motion в globals.css гасит это появление вместе со всеми.

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="reveal">
      {children}
    </div>
  );
}
