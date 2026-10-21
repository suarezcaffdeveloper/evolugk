import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Las variables de .env.local quedan disponibles para las pruebas de base de datos.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { tsconfigPaths: true },
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
