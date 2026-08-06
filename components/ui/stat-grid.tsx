import type { ReactNode } from "react";

// The "Обзор" block: a heading and a grid of stat tiles — two per row on a
// phone, four on a wide screen. Every screen uses the same one so the second
// block of every screen looks identical.
export function StatGrid({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title ? <h2 className="mb-3 text-base font-semibold">{title}</h2> : null}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{children}</div>
    </section>
  );
}
