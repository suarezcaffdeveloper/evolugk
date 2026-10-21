import { z } from "zod";

/** Mensajes en español para los formularios de ingreso. */
export const loginSchema = z.object({
  email: z
    .string({ error: "Ingresá tu mail." })
    .trim()
    .toLowerCase()
    .min(1, "Ingresá tu mail.")
    .pipe(z.email({ error: "El mail no tiene un formato válido." })),
  // No se valida largo ni complejidad al ingresar: solo que no esté vacía.
  password: z.string({ error: "Ingresá tu contraseña." }).min(1, "Ingresá tu contraseña."),
});

/** Código de 6 dígitos de la app de autenticación. Se aceptan espacios (muchas apps lo muestran "123 456"). */
export const totpCodeSchema = z
  .string({ error: "Ingresá el código de 6 dígitos." })
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "El código tiene 6 dígitos."));

export type FieldErrors = Partial<Record<string, string>>;

/** Convierte los problemas de zod en un mensaje por campo (el primero de cada uno). */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
