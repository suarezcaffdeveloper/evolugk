import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Las variables de .env.local quedan disponibles para las pruebas de base de datos.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" falla fuera de Next a propósito; en las pruebas se reemplaza por un módulo vacío.
      "server-only": fileURLToPath(new URL("./src/test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Las pruebas de base de datos hacen pedidos de red al proyecto de desarrollo.
    testTimeout: 30_000,
    hookTimeout: 90_000,
    // Los tests contra la base comparten fixtures y se ejecutan de a un archivo.
    fileParallelism: false,
  },
});
