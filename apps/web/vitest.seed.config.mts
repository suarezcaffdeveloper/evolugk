import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Configuración solo para `pnpm seed`: corre scripts/seed-demo.ts con las mismas variables y alias
// que las pruebas (el script usa la lógica de la aplicación, que importa "server-only").
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./src/test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["scripts/seed-demo.ts"], testTimeout: 300_000 },
});
