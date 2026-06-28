import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@vchb/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
    },
  },
});
