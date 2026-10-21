/**
 * Cuotas (spec 06: CA-04 a CA-15, RF-06 a RF-31) y su aislamiento. Corre contra desarrollo:
 * `pnpm test:db`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, argentinaDate } from "@/lib/dates";
import { addMonths } from "@/lib/fees";
import type { EmailMessage, EmailTransport } from "@/server/email/transport";
import {
  applyStatusChangeToFees,
  changeFeesStart,
  generateFees,
  getCollectionOverview,
  getGoalkeeperFees,
  listFeePanel,
  listNoticeLog,
  markFeePaid,
  registerAdvance,
  sendFeeNotices,
  setFeeExempt,
  startFeeCycle,
  undoFeePayment,
  voidFee,
} from "@/server/fees";
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
let other: TestSchool;
let actor: { schoolId: string; actorId: string };
let otherActor: { schoolId: string; actorId: string };
let adminClient: SupabaseClient;
let coachClient: SupabaseClient;
let otherAdminClient: SupabaseClient;

const must = <T>(result: { data: T; error: { message: string } | null }, what: string) => {
  if (result.error || result.data == null) {
    throw new Error(`No se pudo crear ${what}: ${result.error?.message}`);
  }
  return result.data as NonNullable<T>;
};

type GkOptions = { start?: string | null; exempt?: boolean; status?: string };

async function newGoalkeeper(target: TestSchool, label: string, options: GkOptions = {}) {
  return must(
    await admin
      .from("goalkeeper")
      .insert({
        school_id: target.id,
        first_name: label,
        last_name: "Cuotas",
        birth_date: "2012-05-01",
        joined_on: "2020-01-01",
        status: options.status ?? "active",
        fee_exempt: options.exempt ?? false,
        fees_start_on: options.start === undefined ? null : options.start,
      })
      .select("id")
      .single(),
    "el arquero",
  ).id as string;
}

async function newGuardian(target: TestSchool, goalkeeperId: string, email: string | null) {
  const guardianId = must(
    await admin
      .from("guardian")
      .insert({
        school_id: target.id,
        first_name: "Tutor",
        last_name: "Cuotas",
        phone: "1155551111",
        email,
        access_code: crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
        pin_hash: "scrypt$x",
      })
      .select("id")
      .single(),
    "el tutor",
  ).id as string;
  must(
    await admin
      .from("goalkeeper_guardian")
      .insert({
        school_id: target.id,
        goalkeeper_id: goalkeeperId,
        guardian_id: guardianId,
        relationship: "mother",
      })
      .select("guardian_id")
      .single(),
    "el vínculo",
  );
}

async function insertFee(
  target: TestSchool,
  goalkeeperId: string,
  start: string,
  number: number,
  status: "open" | "paid" | "void" = "open",
  dueOverride?: string,
) {
  const dueOn = dueOverride ?? addMonths(start, number - 1);
  return must(
    await admin
      .from("fee")
      .insert({
        school_id: target.id,
        goalkeeper_id: goalkeeperId,
        series_start_on: start,
        number,
        due_on: dueOn,
        grace_until: addDays(dueOn, 10),
        status,
        paid_on: status === "paid" ? dueOn : null,
      })
      .select("id")
      .single(),
    "la cuota",
  ).id as string;
}

const feesOf = async (goalkeeperId: string, schoolId = school.id) =>
  must(
    await admin
      .from("fee")
      .select("id, number, status, due_on, paid_on, series_start_on")
      .eq("school_id", schoolId)
      .eq("goalkeeper_id", goalkeeperId)
      .order("series_start_on")
      .order("number"),
    "la lista de cuotas",
  );

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
  school = await createSchool(admin, "fee-a", { contact_phone: "1144440000" });
  other = await createSchool(admin, "fee-b");
  created.schoolIds.push(school.id, other.id);

  const adminUser = await createStaff(admin, school, "school_admin", "adminA6");
  const coachUser = await createStaff(admin, school, "coach", "coachA6");
  const otherAdminUser = await createStaff(admin, other, "school_admin", "adminB6");
  created.userIds.push(adminUser.id, coachUser.id, otherAdminUser.id);
  actor = { schoolId: school.id, actorId: adminUser.id };
  otherActor = { schoolId: other.id, actorId: otherAdminUser.id };

  [adminClient, coachClient, otherAdminClient] = await Promise.all([
    signIn(adminUser),
    signIn(coachUser),
    signIn(otherAdminUser),
  ]);
});

afterAll(async () => {
  await cleanup(admin, created);
});

describe("alta, importación y ciclo (RF-06, RF-09, CA-10)", () => {
  it("RF-06: el alta con inicio hoy crea la cuota 1 pagada automáticamente", async () => {
    const gk = await newGoalkeeper(school, "Alta");
    await startFeeCycle(admin, { ...actor, goalkeeperId: gk, start: TODAY, today: TODAY });
    const fees = await feesOf(gk);
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ number: 1, status: "paid", paid_on: TODAY });
    const { data } = await admin.from("fee").select("is_automatic").eq("goalkeeper_id", gk);
    expect(data?.[0].is_automatic).toBe(true);
    const { data: g } = await admin
      .from("goalkeeper")
      .select("fees_start_on")
      .eq("id", gk)
      .single();
    expect(g?.fees_start_on).toBe(TODAY);
  });

  it("CA-10: importado con inicio 5 meses atrás, no hay cuotas pasadas y se crea la próxima", async () => {
    const gk = await newGoalkeeper(school, "Importado");
    const start = addMonths(TODAY, -5);
    await startFeeCycle(admin, { ...actor, goalkeeperId: gk, start, today: TODAY });
    const fees = await feesOf(gk);
    expect(fees.map((f) => [f.number, f.status])).toEqual([
      [6, "paid"],
      [7, "open"],
    ]);
  });

  it("RN-02: no puede haber dos cuotas del mismo número en la misma serie", async () => {
    const gk = await newGoalkeeper(school, "Duplicada", { start: TODAY });
    await insertFee(school, gk, TODAY, 1, "paid");
    const again = await admin.from("fee").insert({
      school_id: school.id,
      goalkeeper_id: gk,
      series_start_on: TODAY,
      number: 1,
      due_on: TODAY,
      grace_until: addDays(TODAY, 10),
    });
    expect(again.error?.code).toBe("23505");
  });

  it("una cuota pagada sin fecha de pago se rechaza", async () => {
    const gk = await newGoalkeeper(school, "SinFecha", { start: TODAY });
    const bad = await admin.from("fee").insert({
      school_id: school.id,
      goalkeeper_id: gk,
      series_start_on: TODAY,
      number: 1,
      due_on: TODAY,
      grace_until: addDays(TODAY, 10),
      status: "paid",
    });
    expect(bad.error?.code).toBe("23514");
  });
});

describe("generación automática (RF-07 a RF-09, CA-04, CA-07, CA-11)", () => {
  it("CA-04: genera la cuota 10 días antes de su fecha de pago, y solo una vez", async () => {
    // Fechas fijas: la cuota 2 se paga el 12/04, así que se genera el 02/04.
    const start = "2026-03-12";
    const gk = await newGoalkeeper(school, "Generada", { start });
    await insertFee(school, gk, start, 1, "paid");

    await generateFees(admin, "2026-04-02", [school.id]);
    await generateFees(admin, "2026-04-02", [school.id]);
    const fees = await feesOf(gk);
    expect(fees.map((f) => [f.number, f.status, f.due_on])).toEqual([
      [1, "paid", start],
      [2, "open", "2026-04-12"],
    ]);
  });

  it("no genera antes de tiempo (el 01/04 todavía no)", async () => {
    const start = "2026-03-12";
    const gk = await newGoalkeeper(school, "Temprano", { start });
    await insertFee(school, gk, start, 1, "paid");
    await generateFees(admin, "2026-04-01", [school.id]);
    expect(await feesOf(gk)).toHaveLength(1);
  });

  it("CA-07: un arquero exento, inactivo o sin inicio de cuotas no genera cuotas", async () => {
    const start = "2026-03-12";
    const exempt = await newGoalkeeper(school, "Exento", { start, exempt: true });
    const inactive = await newGoalkeeper(school, "Inactivo", { start, status: "inactive" });
    const noStart = await newGoalkeeper(school, "SinInicio");
    await generateFees(admin, "2026-04-02", [school.id]);
    for (const gk of [exempt, inactive, noStart]) expect(await feesOf(gk)).toHaveLength(0);
  });

  it("CA-11: un adelanto de 3 meses deja pagadas las 3 siguientes y la generación no las duplica", async () => {
    const start = addMonths(TODAY, -1);
    const gk = await newGoalkeeper(school, "Adelanto", { start });
    await insertFee(school, gk, start, 1, "paid");
    await insertFee(school, gk, start, 2, "paid");

    const result = await registerAdvance(admin, {
      ...actor,
      goalkeeperId: gk,
      months: 3,
      today: TODAY,
    });
    expect(result).toEqual({ ok: true, paidNumbers: [3, 4, 5] });
    const before = await feesOf(gk);
    expect(before.map((f) => [f.number, f.status])).toEqual([
      [1, "paid"],
      [2, "paid"],
      [3, "paid"],
      [4, "paid"],
      [5, "paid"],
    ]);

    await generateFees(admin, TODAY, [school.id]);
    expect(await feesOf(gk)).toHaveLength(5);
  });

  it("un adelanto paga primero la cuota abierta que ya existe", async () => {
    const start = addMonths(TODAY, -1);
    const gk = await newGoalkeeper(school, "Adelanto2", { start });
    await insertFee(school, gk, start, 1, "paid");
    await insertFee(school, gk, start, 2, "open");
    const result = await registerAdvance(admin, {
      ...actor,
      goalkeeperId: gk,
      months: 2,
      today: TODAY,
    });
    expect(result).toEqual({ ok: true, paidNumbers: [2, 3] });
  });

  it("rechaza adelantos de 0 o de más de 12 meses", async () => {
    const gk = await newGoalkeeper(school, "Tope", { start: TODAY });
    for (const months of [0, 13]) {
      expect(
        await registerAdvance(admin, { ...actor, goalkeeperId: gk, months, today: TODAY }),
      ).toEqual({
        ok: false,
        error: "invalid",
      });
    }
  });
});

describe("pagos (RF-13 a RF-17, CA-15)", () => {
  it("registra el pago con su fecha real y deja la revisión", async () => {
    const start = addMonths(TODAY, -1);
    const gk = await newGoalkeeper(school, "Paga", { start });
    const fee = await insertFee(school, gk, start, 2 - 1 + 1, "open");
    expect(await markFeePaid(admin, { ...actor, feeId: fee, paidOn: TODAY, today: TODAY })).toEqual(
      { ok: true },
    );
    const [row] = await feesOf(gk);
    expect(row).toMatchObject({ status: "paid", paid_on: TODAY });
    const { data } = await admin
      .from("fee_revision")
      .select("action, new_paid_on, edited_by")
      .eq("fee_id", fee);
    expect(data).toEqual([{ action: "paid", new_paid_on: TODAY, edited_by: actor.actorId }]);
  });

  it("rechaza una fecha de pago anterior al inicio de cuotas o futura", async () => {
    const start = addMonths(TODAY, -1);
    const gk = await newGoalkeeper(school, "Fechas", { start });
    const fee = await insertFee(school, gk, start, 1, "open");
    expect(
      await markFeePaid(admin, { ...actor, feeId: fee, paidOn: addDays(start, -1), today: TODAY }),
    ).toEqual({
      ok: false,
      error: "before_start",
    });
    expect(
      await markFeePaid(admin, { ...actor, feeId: fee, paidOn: addDays(TODAY, 1), today: TODAY }),
    ).toEqual({
      ok: false,
      error: "future_date",
    });
  });

  it("CA-15: deshacer un pago devuelve la cuota al estado por fecha y lo registra", async () => {
    const start = addMonths(TODAY, -2);
    const gk = await newGoalkeeper(school, "Deshace", { start });
    const fee = await insertFee(school, gk, start, 1, "open"); // vencida hace más de 10 días
    await markFeePaid(admin, { ...actor, feeId: fee, paidOn: TODAY, today: TODAY });
    expect(await undoFeePayment(admin, { ...actor, feeId: fee })).toEqual({ ok: true });
    const detail = await getGoalkeeperFees(admin, {
      schoolId: school.id,
      goalkeeperId: gk,
      today: TODAY,
    });
    expect(detail?.fees[0].status).toBe("overdue");
    expect(detail?.standing).toBe("overdue");
    expect(detail?.history.map((h) => h.action)).toEqual(
      expect.arrayContaining(["paid", "unpaid"]),
    );
    // No se puede deshacer lo que no está pagado.
    expect(await undoFeePayment(admin, { ...actor, feeId: fee })).toEqual({
      ok: false,
      error: "not_paid",
    });
  });

  it("anular una cuota vencida la saca de la deuda (RF-17)", async () => {
    const start = addMonths(TODAY, -2);
    const gk = await newGoalkeeper(school, "Anula", { start });
    const fee = await insertFee(school, gk, start, 1, "open");
    expect(await voidFee(admin, { ...actor, feeId: fee, note: "Beca" })).toEqual({ ok: true });
    const panel = await listFeePanel(admin, { schoolId: school.id, today: TODAY });
    expect(panel.some((p) => p.id === fee)).toBe(false);
  });
});

describe("baja, reactivación, exentos e inicio (RF-18 a RF-23, CA-08, CA-09)", () => {
  it("CA-08: al pasar a inactivo se conserva la vencida y se anula la futura", async () => {
    const start = addMonths(TODAY, -2);
    const gk = await newGoalkeeper(school, "Baja", { start });
    const overdue = await insertFee(school, gk, start, 1, "open");
    const future = await insertFee(school, gk, start, 4, "open"); // con fecha de pago futura
    await admin.from("goalkeeper").update({ status: "inactive" }).eq("id", gk);
    await applyStatusChangeToFees(admin, {
      ...actor,
      goalkeeperId: gk,
      previousStatus: "active",
      status: "inactive",
      today: TODAY,
    });
    const rows = Object.fromEntries((await feesOf(gk)).map((f) => [f.id, f.status]));
    expect(rows[overdue]).toBe("open");
    expect(rows[future]).toBe("void");
  });

  it("CA-09: al reactivar, el inicio es hoy y se crea la cuota 1 pagada automáticamente", async () => {
    const start = addMonths(TODAY, -4);
    const gk = await newGoalkeeper(school, "Vuelve", { start, status: "inactive" });
    await insertFee(school, gk, start, 1, "paid");
    await admin.from("goalkeeper").update({ status: "active" }).eq("id", gk);
    await applyStatusChangeToFees(admin, {
      ...actor,
      goalkeeperId: gk,
      previousStatus: "inactive",
      status: "active",
      today: TODAY,
    });
    const { data: g } = await admin
      .from("goalkeeper")
      .select("fees_start_on")
      .eq("id", gk)
      .single();
    expect(g?.fees_start_on).toBe(TODAY);
    const fees = await feesOf(gk);
    const series = fees.filter((f) => f.series_start_on === TODAY);
    expect(series.map((f) => [f.number, f.status])).toEqual([[1, "paid"]]);
    // Las cuotas de la serie anterior siguen ahí.
    expect(fees.filter((f) => f.series_start_on === start)).toHaveLength(1);
  });

  it("un exento no genera cuotas; al quitar la marca el ciclo se reinicia", async () => {
    const start = addMonths(addDays(TODAY, 10), -1);
    const gk = await newGoalkeeper(school, "Beca", { start });
    await insertFee(school, gk, start, 1, "paid");
    const future = await insertFee(school, gk, start, 3, "open");
    expect(
      await setFeeExempt(admin, {
        ...actor,
        goalkeeperId: gk,
        exempt: true,
        note: "Hijo del personal",
        today: TODAY,
      }),
    ).toEqual({ ok: true });
    await generateFees(admin, TODAY, [school.id]);
    const exemptRows = await feesOf(gk);
    expect(exemptRows.find((f) => f.id === future)?.status).toBe("void");
    expect(exemptRows).toHaveLength(2);

    await setFeeExempt(admin, {
      ...actor,
      goalkeeperId: gk,
      exempt: false,
      note: null,
      today: TODAY,
    });
    const after = await feesOf(gk);
    expect(
      after.filter((f) => f.series_start_on === TODAY).map((f) => [f.number, f.status]),
    ).toEqual([[1, "paid"]]);
  });

  it("RF-23: cambiar el inicio reprograma las abiertas y no toca las pagadas", async () => {
    const start = addMonths(TODAY, -1);
    const gk = await newGoalkeeper(school, "Mueve", { start });
    const paid = await insertFee(school, gk, start, 1, "paid");
    const open = await insertFee(school, gk, start, 2, "open"); // se paga hoy mismo
    const newStart = addDays(start, 3);
    await changeFeesStart(admin, { ...actor, goalkeeperId: gk, start: newStart, today: TODAY });
    const rows = Object.fromEntries((await feesOf(gk)).map((f) => [f.id, f]));
    expect(rows[paid]).toMatchObject({ due_on: start, series_start_on: start });
    expect(rows[open]).toMatchObject({ due_on: addMonths(newStart, 1), series_start_on: newStart });
  });
});

describe("avisos por mail (RF-24 a RF-31, CA-05, CA-06, CA-12, CA-14)", () => {
  /** Una cuota abierta cuyo primer aviso (5 días antes) sale hoy. */
  async function noticeCase(label: string, emails: (string | null)[], target = school) {
    const dueOn = addDays(TODAY, 5);
    const start = addMonths(dueOn, -1);
    const gk = await newGoalkeeper(target, label, { start });
    const fee = await insertFee(target, gk, start, 2, "open", dueOn);
    for (const email of emails) await newGuardian(target, gk, email);
    return { gk, fee };
  }

  it("CA-05: correr el proceso dos veces el mismo día manda un solo mail", async () => {
    const { fee } = await noticeCase("Aviso", ["familia1@example.com"]);
    const { sent, transport } = fakeTransport();
    const first = await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    const second = await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(second.sent).toBe(0);
    expect(sent.filter((m) => m.to === "familia1@example.com")).toHaveLength(1);
    const log = await listNoticeLog(admin, { schoolId: school.id });
    expect(
      log.filter((l) => l.status === "sent" && l.type === "fee_5_days_before"),
    ).not.toHaveLength(0);
    expect(fee).toBeTruthy();
  });

  it("RF-29: el mail trae la escuela, el arquero, la fecha y el contacto, sin montos", async () => {
    await noticeCase("Contenido", ["contenido@example.com"]);
    const { sent, transport } = fakeTransport();
    await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    const message = sent.find((m) => m.to === "contenido@example.com");
    expect(message?.text).toContain("Contenido Cuotas");
    expect(message?.text).toContain("1144440000");
    expect(`${message?.html}${message?.text}`).not.toMatch(/\$|ARS|pesos/);
  });

  it("CA-14: dos tutores con el mismo mail reciben uno solo; CA-12: sin mail no se manda", async () => {
    await noticeCase("Compartido", ["compartido@example.com", "Compartido@Example.com", null]);
    const { sent, transport } = fakeTransport();
    await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    expect(sent.filter((m) => m.to === "compartido@example.com")).toHaveLength(1);
  });

  it("CA-06: una cuota pagada antes del envío no genera aviso", async () => {
    const { fee } = await noticeCase("Pagado", ["pagado@example.com"]);
    await markFeePaid(admin, { ...actor, feeId: fee, paidOn: TODAY, today: TODAY });
    const { sent, transport } = fakeTransport();
    await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    expect(sent.some((m) => m.to === "pagado@example.com")).toBe(false);
  });

  it("no avisa por exentos, inactivos ni cuotas anuladas", async () => {
    const exempt = await noticeCase("ExentoAviso", ["exento@example.com"]);
    await admin.from("goalkeeper").update({ fee_exempt: true }).eq("id", exempt.gk);
    const inactive = await noticeCase("InactivoAviso", ["inactivo@example.com"]);
    await admin.from("goalkeeper").update({ status: "inactive" }).eq("id", inactive.gk);
    const voided = await noticeCase("AnuladaAviso", ["anulada@example.com"]);
    await voidFee(admin, { ...actor, feeId: voided.fee, note: null });
    const { sent, transport } = fakeTransport();
    await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    for (const to of ["exento@", "inactivo@", "anulada@"]) {
      expect(sent.some((m) => m.to.startsWith(to))).toBe(false);
    }
  });

  it("una escuela suspendida no recibe envíos, pero sus cuotas siguen su ciclo", async () => {
    const suspended = await createSchool(admin, "fee-susp");
    created.schoolIds.push(suspended.id);
    await admin
      .from("school")
      .update({ status: "suspended", suspended_at: new Date().toISOString() })
      .eq("id", suspended.id);
    await noticeCase("Suspendida", ["suspendida@example.com"], suspended);
    const { sent, transport } = fakeTransport();
    await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [suspended.id] });
    expect(sent).toHaveLength(0);
  });

  it("un envío fallido queda registrado y se reintenta en la ventana de recuperación", async () => {
    await noticeCase("Rebota", ["rebota@example.com"]);
    const failing: EmailTransport = async () => ({
      ok: false,
      reason: "rejected",
      detail: "bounce",
    });
    const first = await sendFeeNotices(admin, failing, TODAY, { onlySchoolIds: [school.id] });
    expect(first.failed).toBeGreaterThanOrEqual(1);
    const log = await listNoticeLog(admin, { schoolId: school.id });
    expect(log.find((l) => l.recipient === "rebota@example.com")?.status).toBe("failed");

    const { sent, transport } = fakeTransport();
    await sendFeeNotices(admin, transport, TODAY, { onlySchoolIds: [school.id] });
    expect(sent.some((m) => m.to === "rebota@example.com")).toBe(true);
  });
});

describe("panel y resumen de cobranza (RF-32 a RF-35)", () => {
  it("el panel ordena por urgencia y el resumen cuenta por mes de la fecha de pago", async () => {
    const target = await createSchool(admin, "fee-panel");
    created.schoolIds.push(target.id);
    const month = TODAY.slice(0, 7);
    const a = await newGoalkeeper(target, "Atrasada", { start: addMonths(TODAY, -1) });
    const b = await newGoalkeeper(target, "PorVencer", { start: addMonths(TODAY, -1) });
    const veryLate = await insertFee(target, a, addDays(TODAY, -25), 1, "open");
    const soon = await insertFee(target, b, addDays(TODAY, 3), 1, "open");
    await newGoalkeeper(target, "Becado", { exempt: true });
    await insertFee(target, a, addDays(TODAY, -60), 1, "paid");

    const panel = await listFeePanel(admin, { schoolId: target.id, today: TODAY });
    expect(panel.map((p) => p.id)).toEqual([veryLate, soon]);
    expect(panel[0]).toMatchObject({ status: "overdue", daysOverdue: 15 });

    const overview = await getCollectionOverview(admin, {
      schoolId: target.id,
      month,
      today: TODAY,
    });
    expect(overview.summary.exempt).toBe(1);
    expect(overview.debtors.map((d) => d.id)).toEqual([veryLate]);
  });
});

describe("aislamiento y permisos (RLS)", () => {
  it("el admin ve solo las cuotas de su escuela; el profesor, ninguna", async () => {
    const gk = await newGoalkeeper(school, "Privada", { start: TODAY });
    await insertFee(school, gk, TODAY, 1, "paid");
    const otherGk = await newGoalkeeper(other, "Ajena", { start: TODAY });
    await insertFee(other, otherGk, TODAY, 1, "paid");

    const mine = await adminClient.from("fee").select("school_id");
    expect(mine.data?.length).toBeGreaterThan(0);
    expect(mine.data?.every((r) => r.school_id === school.id)).toBe(true);
    expect(
      (await otherAdminClient.from("fee").select("school_id")).data?.every(
        (r) => r.school_id === other.id,
      ),
    ).toBe(true);

    expect((await coachClient.from("fee").select("id")).data).toEqual([]);
    expect((await coachClient.from("fee_revision").select("id")).data).toEqual([]);
    expect((await coachClient.from("notification_log").select("id")).data).toEqual([]);
  });

  it("nadie escribe cuotas desde el cliente", async () => {
    const gk = await newGoalkeeper(school, "NoEscribe", { start: TODAY });
    const insert = await adminClient.from("fee").insert({
      school_id: school.id,
      goalkeeper_id: gk,
      series_start_on: TODAY,
      number: 1,
      due_on: TODAY,
      grace_until: TODAY,
    });
    expect(insert.error?.code).toBe("42501");
    const update = await adminClient
      .from("fee")
      .update({ status: "paid" })
      .eq("school_id", school.id);
    expect(update.error?.code).toBe("42501");
  });

  it("una cuota no puede apuntar a un arquero de otra escuela", async () => {
    const otherGk = await newGoalkeeper(other, "Cruzado", { start: TODAY });
    const cross = await admin.from("fee").insert({
      school_id: school.id,
      goalkeeper_id: otherGk,
      series_start_on: TODAY,
      number: 1,
      due_on: TODAY,
      grace_until: TODAY,
    });
    expect(cross.error?.code).toBe("23503");
  });

  it("las tablas de suscripción no son legibles ni escribibles por el staff", async () => {
    for (const table of ["subscription_payment", "subscription_change", "platform_alert"]) {
      const read = await adminClient.from(table).select("*");
      expect(read.error?.code === "42501" || (read.data ?? []).length === 0).toBe(true);
      const write = await adminClient.from(table).insert({ school_id: school.id });
      expect(write.error).not.toBeNull();
    }
    expect(otherActor.schoolId).toBe(other.id);
  });
});
