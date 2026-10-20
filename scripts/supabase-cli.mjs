#!/usr/bin/env node
/**
 * Ejecuta el CLI de Supabase con las credenciales del archivo local
 * `supabase/.secrets.local` (ignorado por git), para que nunca pasen por el chat
 * ni por la línea de comandos.
 *
 * Uso:  pnpm db <comando de supabase>
 *   pnpm db link            vincula el proyecto de DESARROLLO (usa SUPABASE_PROJECT_REF)
 *   pnpm db migration new nombre
 *   pnpm db db push         aplica las migraciones pendientes
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secretsPath = join(root, "supabase", ".secrets.local");

function loadSecrets(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const args = process.argv.slice(2);
const env = { ...process.env };

if (existsSync(secretsPath)) {
  Object.assign(env, loadSecrets(secretsPath));
} else {
  console.warn(
    "Aviso: no existe supabase/.secrets.local. Los comandos que necesitan la cuenta o la base van a fallar.\n" +
      "Copiá supabase/secrets.example a supabase/.secrets.local y completalo.\n",
  );
}

// `link` toma el proyecto desde el archivo de credenciales para no escribirlo a mano.
if (
  args[0] === "link" &&
  !args.some((a) => a.startsWith("--project-ref")) &&
  env.SUPABASE_PROJECT_REF
) {
  args.push("--project-ref", env.SUPABASE_PROJECT_REF);
}

// Se ejecuta el archivo JS del paquete con el propio Node: sin shell, igual en todos los sistemas.
const cliPath = join(root, "node_modules", "supabase", "dist", "supabase.js");
if (!existsSync(cliPath)) {
  console.error("No se encontró el CLI de Supabase. Corré pnpm install.");
  process.exit(1);
}

const child = spawn(process.execPath, [cliPath, ...args], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
