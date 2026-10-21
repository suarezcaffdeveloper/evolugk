import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { OperatorInputError, type OperatorInput } from "./operator";
import { runOperatorWizard } from "./operator-cli";

/**
 * Simula la terminal: cada vez que el asistente muestra un pedido de dato (termina en ": "),
 * se le responde con la siguiente respuesta de la lista.
 */
function setup(answers: string[], { tty = false }: { tty?: boolean } = {}) {
  const input = new PassThrough() as PassThrough & { isTTY?: boolean };
  if (tty) input.isTTY = true;

  let transcript = "";
  const queue = [...answers];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString();
      transcript += text;
      if (text.endsWith(": ") && queue.length) {
        const next = queue.shift()!;
        setImmediate(() => input.write(`${next}\n`));
      }
      callback();
    },
  });

  const create = vi.fn(async (data: OperatorInput) => ({
    userId: "user-1",
    email: data.email.toLowerCase(),
  }));
  const run = () =>
    runOperatorWizard({ input, output }, { projectHost: "proyecto-de-prueba.supabase.co", create });

  return { run, create, input, transcript: () => transcript };
}

const PASSWORD = "Una-clave-larga-123";

describe("asistente de alta del operador", () => {
  it("crea la cuenta con los datos ingresados", async () => {
    const t = setup(["Ana@Example.com", "Ana", "Pérez", PASSWORD, PASSWORD, "SI"]);
    expect(await t.run()).toBe("created");
    expect(t.create).toHaveBeenCalledWith({
      email: "Ana@Example.com",
      password: PASSWORD,
      firstName: "Ana",
      lastName: "Pérez",
    });
    expect(t.transcript()).toContain("proyecto-de-prueba.supabase.co");
    expect(t.transcript()).toContain("ana@example.com");
    expect(t.transcript()).not.toContain(PASSWORD);
  });

  it.each(["si", "sí", "Sí", " SI "])("acepta %j como confirmación", async (answer) => {
    const t = setup(["a@example.com", "Ana", "Pérez", PASSWORD, PASSWORD, answer]);
    expect(await t.run()).toBe("created");
  });

  it.each(["no", "", "s", "quizás"])("cancela con %j y no crea nada", async (answer) => {
    const t = setup(["a@example.com", "Ana", "Pérez", PASSWORD, PASSWORD, answer]);
    expect(await t.run()).toBe("cancelled");
    expect(t.create).not.toHaveBeenCalled();
    expect(t.transcript()).toContain("No se creó ninguna cuenta.");
  });

  it("deja corregir una contraseña que no coincide", async () => {
    const t = setup([
      "a@example.com",
      "Ana",
      "Pérez",
      "Primera-clave-larga-1",
      "Segunda-clave-larga-2",
      PASSWORD,
      PASSWORD,
      "SI",
    ]);
    expect(await t.run()).toBe("created");
    expect(t.create).toHaveBeenCalledWith(expect.objectContaining({ password: PASSWORD }));
    expect(t.transcript()).toContain("Las contraseñas no coinciden.");
  });

  it("cancela tras tres contraseñas que no coinciden", async () => {
    const t = setup(["a@example.com", "Ana", "Pérez", "a1", "b2", "c3", "d4", "e5", "f6"]);
    expect(await t.run()).toBe("cancelled");
    expect(t.create).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña corta y cancela tras tres intentos", async () => {
    const t = setup([
      "a@example.com",
      "Ana",
      "Pérez",
      "corta",
      "corta",
      "corta",
      "corta",
      "corta",
      "corta",
    ]);
    expect(await t.run()).toBe("cancelled");
    expect(t.create).not.toHaveBeenCalled();
    expect(t.transcript()).toContain("al menos 12 caracteres");
  });

  it("no pide la contraseña si el mail o el nombre son inválidos", async () => {
    const t = setup(["no-es-un-mail", "", "Pérez"]);
    expect(await t.run()).toBe("cancelled");
    expect(t.create).not.toHaveBeenCalled();
    expect(t.transcript()).toContain("El mail no tiene un formato válido.");
    expect(t.transcript()).toContain("Falta el nombre.");
    expect(t.transcript()).not.toContain("Repetí la contraseña");
  });

  it("informa el error sin mostrar la contraseña y no sigue", async () => {
    const t = setup(["a@example.com", "Ana", "Pérez", PASSWORD, PASSWORD, "SI"]);
    t.create.mockRejectedValueOnce(new Error("User already registered"));
    expect(await t.run()).toBe("cancelled");
    expect(t.transcript()).toContain("User already registered");
    expect(t.transcript()).not.toContain(PASSWORD);
  });

  it("muestra los problemas de validación que detecte el alta", async () => {
    const t = setup(["a@example.com", "Ana", "Pérez", PASSWORD, PASSWORD, "SI"]);
    t.create.mockRejectedValueOnce(new OperatorInputError(["Problema de prueba."]));
    expect(await t.run()).toBe("cancelled");
    expect(t.transcript()).toContain("Problema de prueba.");
  });

  it("cancela si se cierra la entrada antes de terminar", async () => {
    const t = setup(["a@example.com"]);
    const result = t.run();
    setTimeout(() => t.input.end(), 30);
    expect(await result).toBe("cancelled");
    expect(t.create).not.toHaveBeenCalled();
  });

  it("en una terminal real no muestra la contraseña al escribirla, pero sí el resto", async () => {
    const t = setup(["a@example.com", "Ana", "Pérez", PASSWORD, PASSWORD, "SI"], { tty: true });
    expect(await t.run()).toBe("created");
    expect(t.transcript()).toContain("a@example.com"); // el mail se ve mientras se escribe
    expect(t.transcript()).not.toContain(PASSWORD.slice(0, 6)); // la contraseña no
  });
});
