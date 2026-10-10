import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next enforces server-only in client bundles; Vitest runs in Node.
      "server-only": path.resolve(__dirname, "./tests/empty-server-only.ts"),
    },
  },
});
