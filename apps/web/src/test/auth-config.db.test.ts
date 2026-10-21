/**
 * Configuración de autenticación del proyecto de desarrollo (`pnpm test:db`).
 *
 * Detecta cambios de configuración que romperían el producto sin avisar. Por ejemplo, en
 * Supabase `[auth.email] enable_signup = false` apaga el proveedor de mail completo y nadie
 * puede ingresar, y `[auth] enable_signup = true` abre el registro libre.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, createUser, purgeLeftovers } from "./db";

const admin = createAdminClient();
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  await purgeLeftovers(admin);
});

describe("configuración de autenticación", () => {
  it("el ingreso con mail y contraseña está habilitado", async () => {
    const user = await createUser(admin, "config-login");
    createdUserIds.push(user.id);
    const { error } = await createAnonClient().auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(error?.code).toBeUndefined();
    expect(error).toBeNull();
  });

  it("el registro libre desde internet está cerrado (las cuentas se crean por invitación)", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.auth.signUp({
      email: `isolation-test-config-${randomUUID().slice(0, 8)}@gmail.com`,
      password: `Aa1-${randomUUID()}`,
    });
    if (data.user) createdUserIds.push(data.user.id); // por si falla: no dejar la cuenta
    expect(error?.code).toBe("signup_disabled");
    expect(data.user).toBeNull();
  });

  it("el servidor sigue pudiendo crear cuentas (lo que usan las invitaciones)", async () => {
    const user = await createUser(admin, "config-servidor");
    createdUserIds.push(user.id);
    expect(user.id).toBeTruthy();
  });

  it("rechaza contraseñas de menos de 8 caracteres y acepta las de 8", async () => {
    const email = (label: string) =>
      `isolation-test-config-${label}-${randomUUID().slice(0, 8)}@example.com`;
    const short = await admin.auth.admin.createUser({
      email: email("corta"),
      password: "Abc1234", // 7
      email_confirm: true,
    });
    expect(short.error?.code).toBe("weak_password");

    const ok = await admin.auth.admin.createUser({
      email: email("ocho"),
      password: "Abc12345", // 8
      email_confirm: true,
    });
    if (ok.data.user) createdUserIds.push(ok.data.user.id);
    expect(ok.error).toBeNull();
  });
});
