// Registers @testing-library/jest-dom matchers (e.g. toBeInTheDocument).
// Safe to import in node-env tests — it only extends expect at import time.
import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

import { clearPageData } from "@/lib/api/page-data-cache";

// Экраны помнят последний показанный ответ по каждому маршруту (см.
// lib/api/page-data-cache) — в приложении эта память живёт столько же, сколько
// окно. Тест — это отдельное окно, а память общая на модуль: без очистки
// следующий тест отрисовался бы числами предыдущего и упал бы на том, чего сам
// не задавал. Здесь, а не в отдельных файлах: забыть в одном месте нельзя.
beforeEach(() => {
  clearPageData();
});

// jsdom lacks ResizeObserver, which recharts' ResponsiveContainer needs.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {
      /* no-op */
    }
    unobserve() {
      /* no-op */
    }
    disconnect() {
      /* no-op */
    }
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;
}

// jsdom lacks the pointer-capture + scroll APIs Radix Select uses when opening.
// Stub them so dropdown interactions work in component tests.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
