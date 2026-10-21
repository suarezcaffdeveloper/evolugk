import { describe, expect, it } from "vitest";
import {
  type SubscriptionDates,
  coveredUntilAfterPayment,
  goalkeeperUsage,
  graceEnded,
  platformAlertsFor,
  subscriptionState,
} from "./subscription";

const paid = (coveredUntil: string): SubscriptionDates => ({
  trialUntil: null,
  coveredUntil,
  manuallySuspended: false,
});
const trial = (until: string): SubscriptionDates => ({
  trialUntil: until,
  coveredUntil: until,
  manuallySuspended: false,
});

describe("subscriptionState (spec 07, RF-07 y RF-10)", () => {
  it("CA-01: con prueba figura en prueba", () => {
    expect(subscriptionState(trial("2026-11-20"), "2026-10-21")).toBe("trial");
  });

  it("CA-02: pasada la fecha de prueba sin cerrar sigue en prueba", () => {
    expect(subscriptionState(trial("2026-11-20"), "2026-12-30")).toBe("trial");
  });

  it("al día hasta 'cubierto hasta' inclusive, vencida desde el día siguiente", () => {
    expect(subscriptionState(paid("2026-03-15"), "2026-03-15")).toBe("current");
    expect(subscriptionState(paid("2026-03-15"), "2026-03-16")).toBe("overdue");
  });

  it("la suspensión manual manda sobre todo", () => {
    const suspended = { trialUntil: null, coveredUntil: "2099-01-01", manuallySuspended: true };
    expect(subscriptionState(suspended, "2026-10-21")).toBe("suspended");
  });
});

describe("gracia (spec 07, CA-05 y CA-06)", () => {
  it("20/03 con cubierto hasta 15/03: vencida, sin gracia terminada", () => {
    expect(subscriptionState(paid("2026-03-15"), "2026-03-20")).toBe("overdue");
    expect(graceEnded(paid("2026-03-15"), "2026-03-20")).toBe(false);
  });

  it("26/03: gracia terminada, y la escuela no pasa a suspendida sola", () => {
    expect(graceEnded(paid("2026-03-15"), "2026-03-25")).toBe(false);
    expect(graceEnded(paid("2026-03-15"), "2026-03-26")).toBe(true);
    expect(subscriptionState(paid("2026-03-15"), "2026-03-26")).toBe("overdue");
  });
});

describe("coveredUntilAfterPayment", () => {
  it("CA-03: un mes suma desde el valor anterior, no desde el día del pago", () => {
    expect(coveredUntilAfterPayment("2026-03-15", 1)).toBe("2026-04-15");
  });
  it("CA-04: 12 meses con un solo registro", () => {
    expect(coveredUntilAfterPayment("2026-03-15", 12)).toBe("2027-03-15");
  });
  it("día 31: usa el último día del mes si hace falta", () => {
    expect(coveredUntilAfterPayment("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("platformAlertsFor (spec 07, RF-29)", () => {
  const base = { goalkeeperLimit: 100, activeGoalkeepers: 10, videoPercent: 0 };
  const alerts = (
    subscription: SubscriptionDates,
    extra: Partial<typeof base> = {},
    today = "2026-10-21",
  ) => platformAlertsFor({ ...base, ...extra, subscription }, today);

  it("prueba por terminar a 7 días y prueba pasada sin cerrar", () => {
    expect(alerts(trial("2026-10-28"))).toEqual(["trial_ending"]);
    expect(alerts(trial("2026-10-29"))).toEqual([]);
    expect(alerts(trial("2026-10-20"))).toEqual(["trial_expired"]);
  });

  it("por vencer, vencida y gracia terminada", () => {
    expect(alerts(paid("2026-10-25"))).toEqual(["expiring_soon"]);
    expect(alerts(paid("2026-10-20"))).toEqual(["overdue"]);
    expect(alerts(paid("2026-10-10"))).toEqual(["overdue", "grace_ended"]);
  });

  it("una escuela suspendida no genera alertas de fechas", () => {
    const suspended = { trialUntil: null, coveredUntil: "2026-01-01", manuallySuspended: true };
    expect(alerts(suspended)).toEqual([]);
  });

  it("CA-07 y CA-08: 90 de 100 avisa, 105 de 100 queda superado", () => {
    const sub = paid("2099-01-01");
    expect(alerts(sub, { activeGoalkeepers: 89 })).toEqual([]);
    expect(alerts(sub, { activeGoalkeepers: 90 })).toEqual(["goalkeeper_limit_90"]);
    expect(alerts(sub, { activeGoalkeepers: 100 })).toEqual(["goalkeeper_limit_90"]);
    expect(alerts(sub, { activeGoalkeepers: 105 })).toEqual(["goalkeeper_limit_exceeded"]);
  });

  it("topes de video al 80% y al 100%", () => {
    const sub = paid("2099-01-01");
    expect(alerts(sub, { videoPercent: 79 })).toEqual([]);
    expect(alerts(sub, { videoPercent: 80 })).toEqual(["video_limit_80"]);
    expect(alerts(sub, { videoPercent: 100 })).toEqual(["video_limit_100"]);
  });
});

describe("goalkeeperUsage", () => {
  it("clasifica el uso del tope", () => {
    expect(goalkeeperUsage(10, 100).level).toBe("ok");
    expect(goalkeeperUsage(90, 100).level).toBe("near");
    expect(goalkeeperUsage(105, 100)).toMatchObject({ level: "exceeded", percent: 105 });
  });
});
