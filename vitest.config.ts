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
    coverage: {
      reporter: ["text", "json", "html"]
    }
  }
});
