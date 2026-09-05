import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir
    }
  },
  test: {
    // Default to node; component tests opt into jsdom via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html"],
      // Floor thresholds, kept a couple of points under the real figure so CI
      // fails on a regression rather than on ordinary noise. They had been left
      // at the baseline of a much younger suite — twenty points of slack, enough
      // to delete a fifth of the tests without CI noticing.
      // Measured 05.09.2026: 70.22 / 61.59 / 61.59 / 72.42.
      thresholds: {
        statements: 68,
        branches: 59,
        functions: 59,
        lines: 70
      }
    }
  }
});
