import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Alta de la cuenta de operador de la plataforma (spec 00: rol `platform_admin`, sin escuela).
 *
 * Recibe el cliente con la clave secreta por parámetro para poder usarse desde el script
 * de línea de comandos y desde las pruebas. No se importa desde código de navegador.
 */

/** El operador tiene poder sobre todas las escuelas: se pide una contraseña más larga que al staff. */
export const OPERATOR_MIN_PASSWORD_LENGTH = 12;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type OperatorInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export class OperatorInputError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(problems.join(" "));
    this.name = "OperatorInputError";
    this.problems = problems;
  }
}

/** Problemas con el mail y el nombre (lista vacía si están bien), en español. */
export function validateOperatorIdentity(
  input: Pick<OperatorInput, "email" | "firstName" | "lastName">,
): string[] {
  const problems: string[] = [];
  if (!EMAIL_PATTERN.test(input.email.trim().toLowerCase())) {
    problems.push("El mail no tiene un formato válido.");
  }
  if (!input.firstName.trim()) problems.push("Falta el nombre.");
  if (!input.lastName.trim()) problems.push("Falta el apellido.");
  return problems;
}

/** Problemas con la contraseña (lista vacía si está bien), en español. */
export function validateOperatorPassword(password: string, email: string): string[] {
  if (password.length < OPERATOR_MIN_PASSWORD_LENGTH) {
    return [`La contraseña debe tener al menos ${OPERATOR_MIN_PASSWORD_LENGTH} caracteres.`];
  }
  if (password.toLowerCase() === email.trim().toLowerCase()) {
    return ["La contraseña no puede ser igual al mail."];
  }
  return [];
}

/** Todos los problemas de los datos del operador (lista vacía si son válidos). */
export function validateOperatorInput(input: OperatorInput): string[] {
  return [
    ...validateOperatorIdentity(input),
    ...validateOperatorPassword(input.password, input.email),
  ];
}

/**
 * Crea la cuenta (ya confirmada) y su perfil de operador. Si el perfil falla, deshace la cuenta
 * para no dejar un usuario sin perfil.
 */
export async function createOperator(
  admin: SupabaseClient,
  input: OperatorInput,
): Promise<{ userId: string; email: string }> {
  const problems = validateOperatorInput(input);
  if (problems.length) throw new OperatorInputError(problems);

  const email = input.email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear la cuenta: ${error?.message ?? "sin detalle"}`);
  }

  const userId = data.user.id;
  const profile = await admin.from("profile").insert({
    user_id: userId,
    school_id: null,
    role: "platform_admin",
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
  });
  if (profile.error) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`No se pudo crear el perfil de operador: ${profile.error.message}`);
  }

  // La auditoría es de mejor esfuerzo: no debe impedir que la cuenta quede creada.
  await admin.from("audit_log").insert({
    school_id: null,
    actor_id: userId,
    action: "operator.created",
    entity: "profile",
    entity_id: userId,
  });

  return { userId, email };
}
