import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Testujeme čisté funkcie v src/lib — bez databázy a bez DOM.
    include: ["src/lib/**/*.test.ts"],
  },
});
