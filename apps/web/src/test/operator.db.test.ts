/**
 * Alta de la cuenta de operador contra el proyecto de desarrollo (`pnpm test:db`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OperatorInputError, createOperator } from "../server/operator";
import { createAdminClient, createAnonClient, elevateToAal2, purgeLeftovers, signIn } from "./db";

const admin = createAdminClient();
const createdUserIds: string[] = [];

const newEmail = (label: string) =>
  `isolation-test-op-${label}-${randomUUID().slice(0, 8)}@example.com`;
const newPassword = () => `Aa1-${randomUUID()}`;

async function userExists(userId: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return Boolean(data.user);
}

beforeAll(async () => {
  await purgeLeftovers(admin);
});

afterAll(async () => {
  await admin.from("audit_log").delete().in("actor_id", createdUserIds);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("createOperator", () => {
  it("crea la cuenta y el perfil de operador, sin escuela", async () => {
    const email = newEmail("ok");
    const password = newPassword();
    const result = await createOperator(admin, {
      email: email.toUpperCase(), // se normaliza a minúsculas
      password,
      firstName: "  Sofía ",
      lastName: "Operadora",
    });
    createdUserIds.push(result.userId);
    expect(result.email).toBe(email);

    const { data: profile } = await admin
      .from("profile")
      .select("*")
      .eq("user_id", result.userId)
      .single();
    expect(profile).toMatchObject({
      user_id: result.userId,
      school_id: null,
      role: "platform_admin",
      first_name: "Sofía",
      last_name: "Operadora",
      active: true,
    });

    const { data: log } = await admin
      .from("audit_log")
      .select("action, entity, school_id")
      .eq("actor_id", result.userId);
    expect(log).toEqual([{ action: "operator.created", entity: "profile", school_id: null }]);
  });

  it("la cuenta creada inicia sesión, pero solo ve las escuelas después del segundo paso", async () => {
    const email = newEmail("login");
    const password = newPassword();
    const { userId } = await createOperator(admin, {
      email,
      password,
      firstName: "Op",
      lastName: "Login",
    });
    createdUserIds.push(userId);

    const client = await signIn({ id: userId, email, password });
    const { data: me } = await client.from("profile").select("role").eq("user_id", userId);
    expect(me).toEqual([{ role: "platform_admin" }]);

    const school = await admin
      .from("school")
      .insert({ name: "Escuela del operador", slug: `test-iso-op-${randomUUID().slice(0, 8)}` })
      .select("id")
      .single();
    try {
      // Con solo la contraseña (aal1) no ve ninguna escuela.
      const before = await client.from("school").select("id").eq("id", school.data!.id);
      expect(before.data).toEqual([]);

      // Con el segundo paso verificado (aal2), sí.
      await elevateToAal2(client);
      const after = await client.from("school").select("id").eq("id", school.data!.id);
      expect(after.data).toEqual([{ id: school.data!.id }]);
    } finally {
      await admin.from("school").delete().eq("id", school.data!.id);
    }
  });

  it("no permite crear dos cuentas con el mismo mail", async () => {
    const email = newEmail("dup");
    const first = await createOperator(admin, {
      email,
      password: newPassword(),
      firstName: "A",
      lastName: "B",
    });
    createdUserIds.push(first.userId);

    await expect(
      createOperator(admin, { email, password: newPassword(), firstName: "C", lastName: "D" }),
    ).rejects.toThrow(/No se pudo crear la cuenta/);

    const { data } = await admin.from("profile").select("user_id").eq("role", "platform_admin");
    expect((data ?? []).filter((row) => row.user_id === first.userId)).toHaveLength(1);
  });

  it.each([
    ["contraseña corta", { password: "corta" }],
    ["mail inválido", { email: "no-es-un-mail" }],
    ["sin nombre", { firstName: "  " }],
    ["sin apellido", { lastName: "" }],
  ])("rechaza %s sin crear nada", async (_label, override) => {
    const email = newEmail("inv");
    const input = { email, password: newPassword(), firstName: "A", lastName: "B", ...override };
    await expect(createOperator(admin, input)).rejects.toBeInstanceOf(OperatorInputError);

    const { error } = await createAnonClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    expect(error).not.toBeNull(); // la cuenta no existe
  });

  it("si falla el perfil, deshace la cuenta para no dejar un usuario huérfano", async () => {
    const email = newEmail("rollback");
    let createdId: string | null = null;

    // Cliente que delega todo en el real, pero hace fallar el alta del perfil.
    const failing = new Proxy(admin, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) =>
            table === "profile"
              ? { insert: async () => ({ error: { message: "fallo simulado" } }) }
              : target.from(table);
        }
        if (prop === "auth") {
          const auth = target.auth;
          return {
            admin: {
              createUser: async (...args: Parameters<typeof auth.admin.createUser>) => {
                const result = await auth.admin.createUser(...args);
                createdId = result.data.user?.id ?? null;
                return result;
              },
              deleteUser: (id: string) => auth.admin.deleteUser(id),
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as SupabaseClient;

    await expect(
      createOperator(failing, { email, password: newPassword(), firstName: "A", lastName: "B" }),
    ).rejects.toThrow(/No se pudo crear el perfil de operador: fallo simulado/);

    expect(createdId).not.toBeNull();
    expect(await userExists(createdId!)).toBe(false);
  });
});
