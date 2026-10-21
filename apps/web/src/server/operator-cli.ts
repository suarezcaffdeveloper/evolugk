import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import {
  OPERATOR_MIN_PASSWORD_LENGTH,
  OperatorInputError,
  validateOperatorIdentity,
  validateOperatorPassword,
  type OperatorInput,
} from "./operator.ts";

export type WizardIO = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
};

export type WizardDeps = {
  /** Host del proyecto de Supabase al que se va a escribir (se muestra antes de confirmar). */
  projectHost: string;
  create: (input: OperatorInput) => Promise<{ userId: string; email: string }>;
};

const MAX_PASSWORD_ATTEMPTS = 3;

/**
 * Asistente interactivo para crear la cuenta de operador. Pide mail, nombre y contraseña
 * (sin mostrarla en pantalla) y confirma el proyecto de destino antes de escribir nada.
 * Las credenciales solo pasan por la terminal de quien lo ejecuta.
 */
export async function runOperatorWizard(
  io: WizardIO,
  deps: WizardDeps,
): Promise<"created" | "cancelled"> {
  const say = (text = "") => io.output.write(`${text}\n`);
  const cancel = (...lines: string[]) => {
    lines.forEach((line) => say(line));
    say("No se creó ninguna cuenta.");
    return "cancelled" as const;
  };

  // Mientras `muted` es true, lo que se escribe no se muestra (para la contraseña).
  let muted = false;
  const gate = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) io.output.write(chunk);
      callback();
    },
  });
  const rl = createInterface({
    input: io.input,
    output: gate,
    terminal: Boolean((io.input as { isTTY?: boolean }).isTTY),
  });

  // Si la entrada se cierra (Ctrl+D) o se corta con Ctrl+C, una pregunta pendiente nunca se
  // resolvería y el script quedaría colgado: se la convierte en un error que cancela el alta.
  const closed = new Promise<never>((_resolve, reject) => {
    rl.once("close", () =>
      reject(Object.assign(new Error("Entrada cerrada"), { code: "ERR_USE_AFTER_CLOSE" })),
    );
  });
  closed.catch(() => {}); // evita un rechazo sin atender si nadie estaba esperando
  rl.on("SIGINT", () => rl.close());

  const ask = (question: string) => Promise.race([rl.question(question), closed]);
  const askHidden = async (question: string) => {
    io.output.write(question);
    muted = true;
    try {
      return await Promise.race([rl.question(""), closed]);
    } finally {
      muted = false;
      say();
    }
  };

  try {
    say("Alta del operador de la plataforma (rol platform_admin).");
    say(`Proyecto de destino: ${deps.projectHost}`);
    say();

    const email = (await ask("Mail: ")).trim();
    const firstName = (await ask("Nombre: ")).trim();
    const lastName = (await ask("Apellido: ")).trim();

    const identityProblems = validateOperatorIdentity({ email, firstName, lastName });
    if (identityProblems.length) return cancel(...identityProblems.map((p) => `  - ${p}`));

    let password = "";
    for (let attempt = 1; ; attempt += 1) {
      const first = await askHidden(
        `Contraseña (mínimo ${OPERATOR_MIN_PASSWORD_LENGTH} caracteres): `,
      );
      const second = await askHidden("Repetí la contraseña: ");
      const problems =
        first !== second
          ? ["Las contraseñas no coinciden."]
          : validateOperatorPassword(first, email);
      if (!problems.length) {
        password = first;
        break;
      }
      problems.forEach((p) => say(`  - ${p}`));
      if (attempt >= MAX_PASSWORD_ATTEMPTS) return cancel();
    }

    say();
    say(
      `Se va a crear a ${firstName} ${lastName} <${email.toLowerCase()}> como operador en ${deps.projectHost}.`,
    );
    const answer = (await ask("Escribí SI para continuar (cualquier otra cosa cancela): ")).trim();
    if (!["si", "sí"].includes(answer.toLocaleLowerCase("es-AR"))) return cancel("Cancelado.");

    try {
      const result = await deps.create({ email, password, firstName, lastName });
      say();
      say(`Listo: cuenta de operador creada para ${result.email}.`);
      say(
        "Al ingresar por primera vez al panel del operador vas a activar la verificación en dos pasos.",
      );
      return "created";
    } catch (error) {
      if (error instanceof OperatorInputError) {
        return cancel(...error.problems.map((p) => `  - ${p}`));
      }
      return cancel(
        `No se pudo crear la cuenta: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } catch (error) {
    // La entrada se cerró antes de terminar (por ejemplo, Ctrl+C o Ctrl+D).
    if ((error as { code?: string }).code === "ERR_USE_AFTER_CLOSE") {
      say();
      return cancel("Entrada cerrada.");
    }
    throw error;
  } finally {
    rl.close();
  }
}
