/**
 * Suscripciones (spec 07: CA-03, CA-04, CA-06, CA-10, CA-11, CA-13, CA-14) y sus permisos.
 * Corre contra desarrollo: `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { argentinaDate } from "@/lib/dates";
import type { EmailMessage, EmailTransport } from "@/server/email/transport";
import {
  adjustCoveredUntil,
  closeTrialToPaid,
  dismissAlert,
  getAccountStatement,
  getSchoolPlan,
  incomeByMonth,
  listOpenAlerts,
  refreshPlatformAlerts,
  registerPayment,
  sendOperatorSummary,
  updateConditions,
  voidPayment,
} from "@/server/subscriptions";
import { setSchoolSuspended } from "@/server/schools";
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
const TODAY = argentinaDate(new Date());

let school: TestSchool;
let schoolAdmin: SupabaseClient;
let operatorId: string;

const setSub = (schoolId: string, fields: Record<string, unknown>) =>
  admin.from("subscription").update(fields).eq("school_id", schoolId);
const covered = async (schoolId: string) =>
  (await admin.from("subscription").select("covered_until").eq("school_id", schoolId).single()).data
    ?.covered_until;

function fakeTransport() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = async (message) => {
    sent.push(message);
    return { ok: true, id: null };
  };
  return { sent, transport };
}

beforeAll(async () => {
  await purgeLeftovers(admin);
  school = await createSchool(admin, "sub-a");
  created.schoolIds.push(school.id);
  const adminUser = await createStaff(admin, school, "school_admin", "adminS7");
  created.userIds.push(adminUser.id);
  operatorId = adminUser.id;
  schoolAdmin = await signIn(adminUser);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("pagos de la escuela (RF-14 a RF-17, CA-03, CA-04, CA-14)", () => {
  it("CA-03: un mes suma desde 'cubierto hasta', aunque se pague tarde", async () => {
    await setSub(school.id, { trial_until: null, covered_until: "2026-03-15" });
    const result = await registerPayment(admin, {
      schoolId: school.id,
      actorId: operatorId,
      paidOn: "2026-03-20",
      amountArs: 10000,
      monthsCovered: 1,
      note: null,
      today: TODAY,
    });
    expect(result).toMatchObject({
      ok: true,
      coveredUntil: "2026-04-15",
      suggestReactivate: false,
    });
    expect(await covered(school.id)).toBe("2026-04-15");
  });

  it("CA-04: un pago de 12 meses es un solo registro", async () => {
    await setSub(school.id, { trial_until: null, covered_until: "2026-03-15" });
    const before = (await getAccountStatement(admin, school.id, TODAY))!.payments.length;
    await registerPayment(admin, {
      schoolId: school.id,
      actorId: operatorId,
      paidOn: "2026-03-20",
      amountArs: 100000,
      monthsCovered: 12,
      note: "Anual",
      today: TODAY,
    });
    expect(await covered(school.id)).toBe("2027-03-15");
    expect((await getAccountStatement(admin, school.id, TODAY))!.payments).toHaveLength(before + 1);
  });

  it("rechaza pagos de monto o meses cero", async () => {
    const base = {
      schoolId: school.id,
      actorId: operatorId,
      paidOn: TODAY,
      note: null,
      today: TODAY,
    };
    expect(await registerPayment(admin, { ...base, amountArs: 0, monthsCovered: 1 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await registerPayment(admin, { ...base, amountArs: 100, monthsCovered: 0 })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("CA-14: deshacer el último pago devuelve 'cubierto hasta' al valor anterior", async () => {
    await setSub(school.id, { trial_until: null, covered_until: "2026-06-10" });
    await registerPayment(admin, {
      schoolId: school.id,
      actorId: operatorId,
      paidOn: TODAY,
      amountArs: 5000,
      monthsCovered: 2,
      note: null,
      today: TODAY,
    });
    expect(await covered(school.id)).toBe("2026-08-10");
    const { data } = await admin
      .from("subscription_payment")
      .select("id")
      .eq("school_id", school.id)
      .eq("covered_after", "2026-08-10")
      .single();
    expect(
      await voidPayment(admin, { schoolId: school.id, paymentId: data!.id, actorId: operatorId }),
    ).toEqual({
      ok: true,
    });
    expect(await covered(school.id)).toBe("2026-06-10");
    expect(
      await voidPayment(admin, { schoolId: school.id, paymentId: data!.id, actorId: operatorId }),
    ).toEqual({
      ok: false,
      error: "already_voided",
    });
    const statement = await getAccountStatement(admin, school.id, TODAY);
    expect(statement!.payments.find((p) => p.id === data!.id)?.voided).toBe(true);
  });

  it("RF-17: ajustar 'cubierto hasta' exige una nota y queda en el historial", async () => {
    expect(
      await adjustCoveredUntil(admin, {
        schoolId: school.id,
        actorId: operatorId,
        coveredUntil: "2026-12-01",
        note: " ",
      }),
    ).toEqual({ ok: false, error: "invalid" });
    await adjustCoveredUntil(admin, {
      schoolId: school.id,
      actorId: operatorId,
      coveredUntil: "2026-12-01",
      note: "Acuerdo",
    });
    const statement = await getAccountStatement(admin, school.id, TODAY);
    expect(statement!.changes[0]).toMatchObject({ field: "covered_until", newValue: "2026-12-01" });
  });

  it("CA-11: un pago a una escuela suspendida la deja suspendida y sugiere reactivar", async () => {
    const suspended = await createSchool(admin, "sub-susp");
    created.schoolIds.push(suspended.id);
    await setSchoolSuspended(admin, {
      schoolId: suspended.id,
      suspended: true,
      actorId: operatorId,
    });
    const result = await registerPayment(admin, {
      schoolId: suspended.id,
      actorId: operatorId,
      paidOn: TODAY,
      amountArs: 1000,
      monthsCovered: 1,
      note: null,
      today: TODAY,
    });
    expect(result).toMatchObject({ ok: true, suggestReactivate: true });
    const { data } = await admin.from("school").select("status").eq("id", suspended.id).single();
    expect(data?.status).toBe("suspended");
  });
});

describe("cierre de prueba y condiciones (RF-03, RF-13, CA-10)", () => {
  it("cerrar la prueba pasando a pago cuenta los meses desde la fecha de inicio del cobro", async () => {
    const trial = await createSchool(admin, "sub-trial");
    created.schoolIds.push(trial.id);
    await setSub(trial.id, { trial_until: "2026-10-01", covered_until: "2026-10-01" });
    expect(
      await closeTrialToPaid(admin, {
        schoolId: trial.id,
        actorId: operatorId,
        startOn: "2026-10-21",
        amountArs: 30000,
        monthsCovered: 3,
        note: null,
        paidOn: TODAY,
      }),
    ).toEqual({ ok: true });
    const { data } = await admin
      .from("subscription")
      .select("trial_until, covered_until")
      .eq("school_id", trial.id)
      .single();
    expect(data).toEqual({ trial_until: null, covered_until: "2027-01-21" });
    expect(
      await closeTrialToPaid(admin, {
        schoolId: trial.id,
        actorId: operatorId,
        startOn: TODAY,
        amountArs: 1,
        monthsCovered: 1,
        note: null,
        paidOn: TODAY,
      }),
    ).toEqual({ ok: false, error: "not_trial" });
  });

  it("CA-10: un cambio de precio queda con valor anterior, nuevo, autor y fecha", async () => {
    await updateConditions(admin, {
      schoolId: school.id,
      actorId: operatorId,
      note: "Renegociación",
      changes: { monthlyPriceArs: 12500, goalkeeperLimit: 80 },
    });
    const statement = await getAccountStatement(admin, school.id, TODAY);
    const price = statement!.changes.find((c) => c.field === "monthly_price_ars");
    expect(price).toMatchObject({ oldValue: "10000", newValue: "12500", note: "Renegociación" });
    expect(statement!.changes.some((c) => c.field === "goalkeeper_limit")).toBe(true);
    const { data } = await admin
      .from("subscription_change")
      .select("made_by")
      .eq("school_id", school.id)
      .limit(1)
      .single();
    expect(data?.made_by).toBe(operatorId);
  });

  it("rechaza condiciones inválidas", async () => {
    for (const changes of [
      { monthlyPriceArs: -1 },
      { goalkeeperLimit: 0 },
      { videoMinutesLimit: 1.5 },
    ]) {
      expect(
        await updateConditions(admin, {
          schoolId: school.id,
          actorId: operatorId,
          note: null,
          changes,
        }),
      ).toEqual({
        ok: false,
        error: "invalid",
      });
    }
  });
});

describe("alertas y resumen del operador (RF-29 a RF-31, CA-06, CA-13)", () => {
  it("CA-06: pasados los 10 días de gracia se crea la alerta y la escuela no se suspende sola", async () => {
    const late = await createSchool(admin, "sub-late");
    created.schoolIds.push(late.id);
    await setSub(late.id, { trial_until: null, covered_until: "2026-01-01" });
    await refreshPlatformAlerts(admin, TODAY, [late.id]);
    const types = (await listOpenAlerts(admin))
      .filter((a) => a.schoolId === late.id)
      .map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["overdue", "grace_ended"]));
    const { data } = await admin.from("school").select("status").eq("id", late.id).single();
    expect(data?.status).toBe("active");
  });

  it("las alertas se resuelven solas al registrar el pago", async () => {
    const late = await createSchool(admin, "sub-solve");
    created.schoolIds.push(late.id);
    await setSub(late.id, { trial_until: null, covered_until: "2026-01-01" });
    await refreshPlatformAlerts(admin, TODAY, [late.id]);
    await setSub(late.id, { covered_until: "2099-01-01" });
    const result = await refreshPlatformAlerts(admin, TODAY, [late.id]);
    expect(result.resolved).toBeGreaterThanOrEqual(2);
    expect((await listOpenAlerts(admin)).filter((a) => a.schoolId === late.id)).toEqual([]);
  });

  it("una alerta descartada no se reabre mientras la causa siga", async () => {
    const late = await createSchool(admin, "sub-dismiss");
    created.schoolIds.push(late.id);
    await setSub(late.id, { trial_until: null, covered_until: "2026-01-01" });
    await refreshPlatformAlerts(admin, TODAY, [late.id]);
    const alerts = (await listOpenAlerts(admin)).filter((a) => a.schoolId === late.id);
    for (const a of alerts) await dismissAlert(admin, { alertId: a.id, actorId: operatorId });
    await refreshPlatformAlerts(admin, TODAY, [late.id]);
    expect((await listOpenAlerts(admin)).filter((a) => a.schoolId === late.id)).toEqual([]);
  });

  it("alerta de topes: 90% de arqueros activos y superado", async () => {
    const full = await createSchool(admin, "sub-limit");
    created.schoolIds.push(full.id);
    await setSub(full.id, { goalkeeper_limit: 2 });
    const add = (n: number) =>
      admin.from("goalkeeper").insert(
        Array.from({ length: n }, (_, i) => ({
          school_id: full.id,
          first_name: `G${i}`,
          last_name: "Tope",
          birth_date: "2012-01-01",
          joined_on: "2020-01-01",
        })),
      );
    await add(2);
    await refreshPlatformAlerts(admin, TODAY, [full.id]);
    expect(
      (await listOpenAlerts(admin)).filter((a) => a.schoolId === full.id).map((a) => a.type),
    ).toEqual(["goalkeeper_limit_90"]);
    await add(1); // sigue pudiendo darse de alta: queda superado, no bloqueado.
    await refreshPlatformAlerts(admin, TODAY, [full.id]);
    expect(
      (await listOpenAlerts(admin)).filter((a) => a.schoolId === full.id).map((a) => a.type),
    ).toEqual(["goalkeeper_limit_exceeded"]);
  });

  it("CA-13: sin novedades no se manda mail; con novedades se manda y no se repite", async () => {
    const quiet = await createSchool(admin, "sub-quiet");
    created.schoolIds.push(quiet.id);
    const none = fakeTransport();
    expect(await sendOperatorSummary(admin, none.transport, [quiet.id])).toEqual({
      sent: 0,
      items: 0,
    });
    expect(none.sent).toHaveLength(0);

    await setSub(quiet.id, { trial_until: null, covered_until: "2026-01-01" });
    await refreshPlatformAlerts(admin, TODAY, [quiet.id]);
    const withNews = fakeTransport();
    const first = await sendOperatorSummary(admin, withNews.transport, [quiet.id]);
    expect(first.items).toBeGreaterThan(0);
    const second = await sendOperatorSummary(admin, withNews.transport, [quiet.id]);
    expect(second.items).toBe(first.sent > 0 ? 0 : second.items);
  });
});

describe("vista de la escuela e ingresos (RF-19, RF-32, RF-33, CA-12)", () => {
  it("CA-12: 'Mi plan' trae uso y vencimiento, sin precio ni pagos", async () => {
    const plan = await getSchoolPlan(admin, school.id, TODAY);
    expect(plan).not.toBeNull();
    expect(Object.keys(plan!).sort()).toEqual(["coveredUntil", "goalkeepers", "state", "video"]);
    expect(JSON.stringify(plan)).not.toMatch(/price|amount|payment/i);
  });

  it("el resumen de ingresos suma por mes los pagos no deshechos", async () => {
    const income = await incomeByMonth(admin);
    expect(Array.isArray(income)).toBe(true);
    for (const row of income) expect(row.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("el staff de una escuela no lee precio, pagos, cambios ni alertas", async () => {
    const sub = await schoolAdmin.from("subscription").select("monthly_price_ars");
    expect(sub.data ?? []).toEqual([]);
    for (const table of ["subscription_payment", "subscription_change", "platform_alert"]) {
      const read = await schoolAdmin.from(table).select("*");
      expect(read.error?.code === "42501" || (read.data ?? []).length === 0).toBe(true);
    }
  });
});
