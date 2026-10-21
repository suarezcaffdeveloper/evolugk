import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Las claves de .env.local sirven para preparar datos en la base de desarrollo desde las pruebas.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// E2E_PORT permite correr los e2e de otra rama en paralelo, sin reusar el servidor de otra carpeta.
const PORT = Number(process.env.E2E_PORT ?? 3000);

/**
 * Pruebas end-to-end (`pnpm test:e2e`). Corren contra el proyecto de desarrollo de Supabase:
 * cada archivo crea su propia escuela de prueba y la borra al terminar.
 *
 * Usan el Chrome instalado en la máquina (no descargan navegadores) y el tamaño de pantalla de un
 * celular, que es donde se usa el portal. Si ya hay un servidor en el puerto 3000 lo reutilizan.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Cada prueba depende de datos propios, pero comparten la base: de a una.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-AR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Pixel 7"],
    channel: "chrome",
  },
  webServer: {
    // E2E_PROD=1 prueba la aplicación compilada: el service worker del modo sin conexión solo se
    // activa en producción.
    command: process.env.E2E_PROD
      ? `pnpm exec next build && pnpm exec next start -p ${PORT}`
      : `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: process.env.E2E_PROD ? 420_000 : 120_000,
  },
});
