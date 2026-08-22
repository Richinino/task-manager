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
    // Testujeme čisté funkcie — bez databázy a bez DOM. Rozsah nie je
    // obmedzený na `src/lib`, lebo niektoré čisté moduly (napr. tvar
    // odpovede serverových akcií) žijú inde. Načíta sa aj tak len to, čo si
    // test naozaj naimportuje.
    include: ["src/**/*.test.ts"],
  },
});
