/**
 * Privilegios por columna (hito 7, docs/15-seguridad.md): el staff no puede leer secretos con su
 * sesión, aunque la política de filas le deje ver la fila. Corre contra desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateToken } from "@/server/invitations";
import {
  cleanup,
  createAdminClient,
  createSchool,
  createStaff,
  purgeLeftovers,
  signIn,
  type TestSchool,
} from "./db";

const admin = createAdminClient();
const created = { schoolIds: [] as string[], userIds: [] as string[] };
let school: TestSchool;
let schoolAdmin: SupabaseClient;

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "priv");
  created.schoolIds.push(school.id);
  const user = await createStaff(admin, school, "school_admin", "priv-admin");
  created.userIds.push(user.id);
  schoolAdmin = await signIn(user);
  const { hash } = generateToken();
  await admin.from("invitation").insert({
    school_id: school.id,
    email: `priv-${crypto.randomUUID().slice(0, 6)}@example.com`,
    role: "coach",
    token_hash: hash,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
});

afterAll(async () => cleanup(admin, created));

describe("invitation", () => {
  it("el admin de la escuela ve sus invitaciones pero no el hash del token", async () => {
    const visible = await schoolAdmin.from("invitation").select("id, email, role, expires_at");
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(1);

    const secret = await schoolAdmin.from("invitation").select("token_hash");
    expect(secret.error?.message).toMatch(/permission denied/i);

    // Ni pidiendo todas las columnas.
    const all = await schoolAdmin.from("invitation").select("*");
    expect(all.error?.message).toMatch(/permission denied/i);
  });

  it("el servidor, con la clave secreta, sigue leyendo el hash", async () => {
    const { data, error } = await admin
      .from("invitation")
      .select("token_hash")
      .eq("school_id", school.id);
    expect(error).toBeNull();
    expect(data?.[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("las funciones de trigger siguen funcionando sin EXECUTE público", () => {
  it("updated_at se actualiza (set_updated_at)", async () => {
    const before = (await admin.from("school").select("updated_at").eq("id", school.id).single())
      .data!.updated_at as string;
    await new Promise((r) => setTimeout(r, 20));
    await admin.from("school").update({ name: "Escuela renombrada priv" }).eq("id", school.id);
    const after = (await admin.from("school").select("updated_at").eq("id", school.id).single())
      .data!.updated_at as string;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it("el último admin de una escuela sigue protegido (protect_last_school_admin)", async () => {
    const { error } = await admin
      .from("profile")
      .update({ active: false })
      .eq("school_id", school.id)
      .eq("role", "school_admin");
    expect(error).not.toBeNull();
  });
});
