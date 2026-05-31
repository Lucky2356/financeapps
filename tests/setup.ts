// Registers @testing-library/jest-dom matchers (e.g. toBeInTheDocument).
// Safe to import in node-env tests — it only extends expect at import time.
import "@testing-library/jest-dom/vitest";

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
