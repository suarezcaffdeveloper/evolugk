import { describe, expect, it } from "vitest";
import {
  addMonths,
  collectionSummary,
  currentCycleNumber,
  feeDates,
  feeStatus,
  feesToGenerate,
  initialFees,
  lastGeneratableNumber,
  noticeDueToday,
  overallStanding,
} from "./fees";

describe("addMonths", () => {
  it.each([
    ["2026-03-12", 1, "2026-04-12"],
    ["2027-01-31", 1, "2027-02-28"],
    ["2028-01-31", 1, "2028-02-29"], // bisiesto
    ["2027-01-31", 2, "2027-03-31"],
    ["2026-11-15", 3, "2027-02-15"],
    ["2026-05-31", 13, "2027-06-30"],
    ["2026-03-31", -1, "2026-02-28"],
  ])("%s + %i meses = %s", (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });
});

describe("feeDates (spec 06, CA-01 a CA-03)", () => {
  it("inicio 12/03: la cuota 2 se paga el 12/04 y vence el 22/04", () => {
    expect(feeDates("2026-03-12", 2)).toEqual({ dueOn: "2026-04-12", graceUntil: "2026-04-22" });
  });

  it("pagar tarde no corre el ciclo: la cuota 3 sigue el 12/05", () => {
    // Las fechas dependen solo del inicio, no de cuándo se pagó la anterior.
    expect(feeDates("2026-03-12", 3).dueOn).toBe("2026-05-12");
  });

  it("inicio 31/01: cuota 2 el 28/02 (29/02 en bisiesto) y cuota 3 el 31/03", () => {
    expect(feeDates("2027-01-31", 2).dueOn).toBe("2027-02-28");
    expect(feeDates("2028-01-31", 2).dueOn).toBe("2028-02-29");
    expect(feeDates("2027-01-31", 3).dueOn).toBe("2027-03-31");
  });

  it("la cuota 1 se paga el día de inicio", () => {
    expect(feeDates("2026-03-12", 1)).toEqual({ dueOn: "2026-03-12", graceUntil: "2026-03-22" });
  });
});

describe("feeStatus", () => {
  const fee = { status: "open" as const, dueOn: "2026-04-12", graceUntil: "2026-04-22" };

  it.each([
    ["2026-04-06", "upcoming"],
    ["2026-04-07", "due_soon"], // 5 días antes
    ["2026-04-12", "due_soon"],
    ["2026-04-22", "due_soon"], // último día de gracia: todavía no vencida
    ["2026-04-23", "overdue"],
  ])("el %s figura %s", (today, expected) => {
    expect(feeStatus(fee, today)).toBe(expected);
  });

  it("lo guardado pesa más que las fechas", () => {
    expect(feeStatus({ ...fee, status: "paid" }, "2026-06-01")).toBe("paid");
    expect(feeStatus({ ...fee, status: "void" }, "2026-06-01")).toBe("void");
  });
});

describe("overallStanding", () => {
  it("el peor estado manda: vencida > por vencer > al día", () => {
    expect(overallStanding([])).toBe("current");
    expect(overallStanding(["paid", "upcoming"])).toBe("current");
    expect(overallStanding(["upcoming", "due_soon"])).toBe("due_soon");
    expect(overallStanding(["due_soon", "overdue", "overdue"])).toBe("overdue");
  });
});

describe("ciclo vigente y generación", () => {
  it("currentCycleNumber encuentra la última fecha de pago alcanzada", () => {
    expect(currentCycleNumber("2026-03-12", "2026-03-12")).toBe(1);
    expect(currentCycleNumber("2026-03-12", "2026-04-11")).toBe(1);
    expect(currentCycleNumber("2026-03-12", "2026-04-12")).toBe(2);
    expect(currentCycleNumber("2026-03-12", "2026-08-12")).toBe(6);
    expect(currentCycleNumber("2026-03-12", "2026-03-01")).toBe(0);
    // Con día 31 y meses cortos.
    expect(currentCycleNumber("2027-01-31", "2027-02-27")).toBe(1);
    expect(currentCycleNumber("2027-01-31", "2027-02-28")).toBe(2);
  });

  it("CA-04: una cuota con fecha de pago el 12/04 se genera el 02/04", () => {
    expect(lastGeneratableNumber("2026-03-12", "2026-04-01")).toBe(1);
    expect(lastGeneratableNumber("2026-03-12", "2026-04-02")).toBe(2);
  });

  it("feesToGenerate crea la siguiente cuota y no duplica las existentes", () => {
    expect(feesToGenerate("2026-03-12", "2026-04-01", [1])).toEqual([]);
    const generated = feesToGenerate("2026-03-12", "2026-04-02", [1]);
    expect(generated).toEqual([
      { number: 2, dueOn: "2026-04-12", graceUntil: "2026-04-22", paidAutomatically: false },
    ]);
  });

  it("CA-11: tras un adelanto de 3 meses la generación no duplica", () => {
    // Cuotas 1 a 4 ya existen (la 1 y tres adelantadas).
    expect(feesToGenerate("2026-03-12", "2026-06-05", [1, 2, 3, 4])).toEqual([]);
    // Cuando llega el momento de la 5, se crea solo esa.
    expect(feesToGenerate("2026-03-12", "2026-07-02", [1, 2, 3, 4]).map((f) => f.number)).toEqual([
      5,
    ]);
  });

  it("después de una caída del proceso recupera las cuotas atrasadas", () => {
    expect(feesToGenerate("2026-03-12", "2026-06-20", [1, 2]).map((f) => f.number)).toEqual([3, 4]);
  });

  it("un ciclo sin cuotas solo crea la vigente, no los ciclos pasados", () => {
    expect(feesToGenerate("2026-03-12", "2026-08-15", []).map((f) => f.number)).toEqual([6]);
  });

  it("un inicio futuro no genera nada hasta 10 días antes", () => {
    expect(feesToGenerate("2026-12-01", "2026-11-20", [])).toEqual([]);
    expect(feesToGenerate("2026-12-01", "2026-11-21", []).map((f) => f.number)).toEqual([1]);
  });
});

describe("initialFees", () => {
  it("RF-06: alta con inicio hoy crea la cuota 1 pagada automáticamente", () => {
    expect(initialFees("2026-10-21", "2026-10-21")).toEqual([
      { number: 1, dueOn: "2026-10-21", graceUntil: "2026-10-31", paidAutomatically: true },
    ]);
  });

  it("CA-10: importado con inicio 5 meses atrás, ciclo vigente pagado y próxima a pagar", () => {
    const planned = initialFees("2026-05-21", "2026-10-21");
    expect(planned).toHaveLength(2);
    expect(planned[0]).toMatchObject({ number: 6, dueOn: "2026-10-21", paidAutomatically: true });
    expect(planned[1]).toMatchObject({ number: 7, dueOn: "2026-11-21", paidAutomatically: false });
  });

  it("un inicio futuro no crea nada todavía", () => {
    expect(initialFees("2026-12-01", "2026-10-21")).toEqual([]);
  });
});

describe("noticeDueToday (spec 06, RF-25)", () => {
  const fee = { dueOn: "2026-04-12", graceUntil: "2026-04-22" };

  it.each([
    ["2026-04-06", null],
    ["2026-04-07", "fee_5_days_before"],
    ["2026-04-12", "fee_due_day"],
    ["2026-04-13", "fee_due_day"], // recuperación de un día sin proceso
    ["2026-04-16", null], // fuera de la ventana de recuperación
    ["2026-04-22", "fee_grace_ends"],
    ["2026-04-25", "fee_3_days_after"],
    ["2026-04-28", "fee_3_days_after"],
    ["2026-04-29", null],
  ])("el %s toca %s", (today, expected) => {
    expect(noticeDueToday(fee, today)).toBe(expected);
  });

  it("CA-04: el primer aviso de una cuota con fecha de pago 12/04 sale el 07/04", () => {
    expect(noticeDueToday(fee, "2026-04-07")).toBe("fee_5_days_before");
  });
});

describe("collectionSummary", () => {
  it("cuenta por mes de la fecha de pago, sin anuladas, y calcula el porcentaje", () => {
    const summary = collectionSummary(
      [
        { dueOn: "2026-10-05", status: "paid" },
        { dueOn: "2026-10-10", status: "paid" },
        { dueOn: "2026-10-20", status: "overdue" },
        { dueOn: "2026-10-28", status: "due_soon" },
        { dueOn: "2026-10-30", status: "void" },
        { dueOn: "2026-11-02", status: "upcoming" },
      ],
      "2026-10",
      2,
    );
    expect(summary).toEqual({
      paid: 2,
      dueSoon: 1,
      overdue: 1,
      upcoming: 0,
      exempt: 2,
      total: 4,
      paidPercent: 50,
    });
  });

  it("sin cuotas el porcentaje no existe", () => {
    expect(collectionSummary([], "2026-10", 0).paidPercent).toBeNull();
  });
});
