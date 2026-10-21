/**
 * Crea la cuenta de operador de la plataforma. Es interactivo: pide mail, nombre y contraseña.
 *
 * Uso (en tu propia terminal, desde la raíz del repositorio):  pnpm operator:create
 *
 * Usa la clave secreta de apps/web/.env.local y escribe en el proyecto de Supabase que indique
 * NEXT_PUBLIC_SUPABASE_URL; antes de crear nada muestra ese proyecto y pide confirmación.
 */
import { createClient } from "@supabase/supabase-js";
import { createOperator } from "../src/server/operator.ts";
import { runOperatorWizard } from "../src/server/operator-cli.ts";

if (!process.stdin.isTTY) {
  console.error(
    "Este script es interactivo y pide una contraseña: ejecutalo en tu propia terminal " +
      "(no desde un chat ni con redirecciones).",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en apps/web/.env.local.");
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const result = await runOperatorWizard(
  { input: process.stdin, output: process.stdout },
  { projectHost: new URL(url).host, create: (input) => createOperator(admin, input) },
);
process.exit(result === "created" ? 0 : 1);
