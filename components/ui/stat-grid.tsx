import type { ReactNode } from "react";

// The "Обзор" block: a heading and a grid of stat tiles — two per row on a
// phone, four on a desktop, six on a wide monitor. Every screen uses the same
// one so the second block of every screen looks identical.
//
// Четыре плитки начинались с xl (1280), и своё же окно приложения — 1280 минус
// полоса прокрутки, то есть 1265 — до этого не дотягивало: на компьютере всегда
// было по две. Считать надо от ширины содержимого, а не окна (см. комментарий в
// components/layout-shell.tsx).
export function StatGrid({
  title,
  actions,
  children
}: {
  title?: string;
  /** The screen's own controls, put on the heading line rather than a row of
      their own — two half-empty strips before any content is a lot of screen
      spent on a checkbox and a button. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {title || actions ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-[15px] font-semibold">{title}</h2> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      <div
        data-testid="stat-grid"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6"
      >
        {children}
      </div>
    </section>
  );
}
