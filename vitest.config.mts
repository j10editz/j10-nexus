import { defineConfig } from "vitest/config";

import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": resolve(process.cwd(), "tests/helpers/empty-server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 15000,
  },
});
